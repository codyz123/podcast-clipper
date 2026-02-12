import { neon } from "@neondatabase/serverless";
import { readFileSync, copyFileSync, mkdirSync, statSync, writeFileSync } from "fs";
import path from "node:path";
import { uploadToR2, deleteFromR2ByUrl, listR2Objects, isR2Configured } from "./r2-storage.js";
import { toISOStringSafe } from "../utils/dates.js";

// Get database connection
function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return neon(databaseUrl);
}

const LOCAL_MEDIA_ROOT = path.join(process.cwd(), ".context", "local-media");

function getLocalMediaBaseUrl(): string {
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL;
  }
  const port = process.env.PORT || "3001";
  return `http://localhost:${port}`;
}

function getLocalMediaPath(folder: string, filename: string): { key: string; path: string } {
  const safeFilename = `${Date.now()}-${filename}`;
  const key = `${folder}/${safeFilename}`;
  const dir = path.join(LOCAL_MEDIA_ROOT, folder);
  mkdirSync(dir, { recursive: true });
  return {
    key,
    path: path.join(dir, safeFilename),
  };
}

function buildLocalMediaUrl(key: string): string {
  return `${getLocalMediaBaseUrl()}/api/local-media/${key}`;
}

// Initialize media tables
export async function initializeMediaTables(): Promise<void> {
  const sql = getDb();

  // Projects table - stores project metadata
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(500) NOT NULL,
      source_url TEXT,
      source_blob_url TEXT,
      transcript JSONB,
      duration_seconds FLOAT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Clips table - stores clip metadata
  await sql`
    CREATE TABLE IF NOT EXISTS clips (
      id VARCHAR(255) PRIMARY KEY,
      project_id VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(500) NOT NULL,
      start_time FLOAT NOT NULL,
      end_time FLOAT NOT NULL,
      transcript_segments JSONB,
      template_id VARCHAR(255),
      background JSONB,
      subtitle JSONB,
      format VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE clips ADD COLUMN IF NOT EXISTS background JSONB`;
  await sql`ALTER TABLE clips ADD COLUMN IF NOT EXISTS subtitle JSONB`;

  // Media assets table - stores uploaded media files
  await sql`
    CREATE TABLE IF NOT EXISTS media_assets (
      id VARCHAR(255) PRIMARY KEY,
      project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      name VARCHAR(500) NOT NULL,
      blob_url TEXT NOT NULL,
      content_type VARCHAR(255),
      size_bytes BIGINT,
      duration_seconds FLOAT,
      width INTEGER,
      height INTEGER,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Rendered clips table - stores exported video files
  await sql`
    CREATE TABLE IF NOT EXISTS rendered_clips (
      id VARCHAR(255) PRIMARY KEY,
      clip_id VARCHAR(255) NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
      format VARCHAR(50) NOT NULL,
      blob_url TEXT NOT NULL,
      size_bytes BIGINT,
      rendered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  console.warn("[Database] Media tables initialized");
}

// Upload a file to R2
export async function uploadMedia(
  file: Buffer,
  filename: string,
  contentType: string,
  folder: string = "media"
): Promise<{ url: string; size: number }> {
  if (isR2Configured()) {
    const key = `${folder}/${Date.now()}-${filename}`;
    return uploadToR2(key, file, contentType);
  }

  const local = getLocalMediaPath(folder, filename);
  writeFileSync(local.path, file);

  return {
    url: buildLocalMediaUrl(local.key),
    size: file.length,
  };
}

// Upload a file from disk path to R2
export async function uploadMediaFromPath(
  filePath: string,
  filename: string,
  contentType: string,
  folder: string = "media"
): Promise<{ url: string; size: number }> {
  if (isR2Configured()) {
    const key = `${folder}/${Date.now()}-${filename}`;
    const fileBuffer = readFileSync(filePath);
    return uploadToR2(key, fileBuffer, contentType);
  }

  const local = getLocalMediaPath(folder, filename);
  copyFileSync(filePath, local.path);
  const { size } = statSync(local.path);

  return {
    url: buildLocalMediaUrl(local.key),
    size,
  };
}

// Delete a file from R2
export async function deleteMedia(url: string): Promise<void> {
  await deleteFromR2ByUrl(url);
}

// List files in R2
export async function listMedia(
  prefix?: string
): Promise<Array<{ url: string; pathname: string; size: number }>> {
  const objects = await listR2Objects(prefix);
  return objects.map((obj) => ({
    url: obj.url,
    pathname: obj.key,
    size: obj.size,
  }));
}

// Save project to database
export async function saveProject(project: {
  id: string;
  name: string;
  sourceUrl?: string;
  sourceBlobUrl?: string;
  transcript?: object;
  durationSeconds?: number;
}): Promise<void> {
  const sql = getDb();

  await sql`
    INSERT INTO projects (id, name, source_url, source_blob_url, transcript, duration_seconds, updated_at)
    VALUES (${project.id}, ${project.name}, ${project.sourceUrl || null}, ${project.sourceBlobUrl || null}, ${JSON.stringify(project.transcript) || null}, ${project.durationSeconds || null}, NOW())
    ON CONFLICT (id)
    DO UPDATE SET
      name = ${project.name},
      source_url = COALESCE(${project.sourceUrl || null}, projects.source_url),
      source_blob_url = COALESCE(${project.sourceBlobUrl || null}, projects.source_blob_url),
      transcript = COALESCE(${JSON.stringify(project.transcript) || null}, projects.transcript),
      duration_seconds = COALESCE(${project.durationSeconds || null}, projects.duration_seconds),
      updated_at = NOW()
  `;
}

// Get project from database
export async function getProject(id: string): Promise<{
  id: string;
  name: string;
  sourceUrl?: string;
  sourceBlobUrl?: string;
  transcript?: object;
  durationSeconds?: number;
  createdAt: string;
  updatedAt: string;
} | null> {
  const sql = getDb();

  const rows = await sql`
    SELECT id, name, source_url, source_blob_url, transcript, duration_seconds, created_at, updated_at
    FROM projects
    WHERE id = ${id}
  `;

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id as string,
    name: row.name as string,
    sourceUrl: row.source_url as string | undefined,
    sourceBlobUrl: row.source_blob_url as string | undefined,
    transcript: row.transcript as object | undefined,
    durationSeconds: row.duration_seconds as number | undefined,
    createdAt: toISOStringSafe(row.created_at) as string,
    updatedAt: toISOStringSafe(row.updated_at) as string,
  };
}

// List all projects
export async function listProjects(): Promise<
  Array<{
    id: string;
    name: string;
    durationSeconds?: number;
    createdAt: string;
    updatedAt: string;
  }>
> {
  const sql = getDb();

  const rows = await sql`
    SELECT id, name, duration_seconds, created_at, updated_at
    FROM projects
    ORDER BY updated_at DESC
  `;

  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    durationSeconds: row.duration_seconds as number | undefined,
    createdAt: toISOStringSafe(row.created_at) as string,
    updatedAt: toISOStringSafe(row.updated_at) as string,
  }));
}

// Delete project and all associated data
export async function deleteProject(id: string): Promise<void> {
  const sql = getDb();

  // Get all blob URLs to delete
  const mediaAssets = await sql`
    SELECT blob_url FROM media_assets WHERE project_id = ${id}
  `;

  const renderedClips = await sql`
    SELECT rc.blob_url FROM rendered_clips rc
    JOIN clips c ON rc.clip_id = c.id
    WHERE c.project_id = ${id}
  `;

  const project = await sql`
    SELECT source_blob_url FROM projects WHERE id = ${id}
  `;

  // Delete blobs from R2
  const urls = [
    ...mediaAssets.map((r) => r.blob_url as string),
    ...renderedClips.map((r) => r.blob_url as string),
    ...(project[0]?.source_blob_url ? [project[0].source_blob_url as string] : []),
  ].filter(Boolean);

  for (const url of urls) {
    try {
      await deleteFromR2ByUrl(url);
    } catch (e) {
      console.error(`Failed to delete blob: ${url}`, e);
    }
  }

  // Delete from database (cascades to clips, media_assets, rendered_clips)
  await sql`DELETE FROM projects WHERE id = ${id}`;
}

// Save clip to database
export async function saveClip(clip: {
  id: string;
  projectId: string;
  name: string;
  startTime: number;
  endTime: number;
  transcriptSegments?: object;
  templateId?: string;
  format?: string;
  background?: object;
  subtitle?: object;
}): Promise<void> {
  const sql = getDb();

  await sql`
    INSERT INTO clips (id, project_id, name, start_time, end_time, transcript_segments, template_id, background, subtitle, format, updated_at)
    VALUES (${clip.id}, ${clip.projectId}, ${clip.name}, ${clip.startTime}, ${clip.endTime}, ${JSON.stringify(clip.transcriptSegments) || null}, ${clip.templateId || null}, ${JSON.stringify(clip.background) || null}, ${JSON.stringify(clip.subtitle) || null}, ${clip.format || null}, NOW())
    ON CONFLICT (id)
    DO UPDATE SET
      name = ${clip.name},
      start_time = ${clip.startTime},
      end_time = ${clip.endTime},
      transcript_segments = COALESCE(${JSON.stringify(clip.transcriptSegments) || null}, clips.transcript_segments),
      template_id = COALESCE(${clip.templateId || null}, clips.template_id),
      background = COALESCE(${JSON.stringify(clip.background) || null}, clips.background),
      subtitle = COALESCE(${JSON.stringify(clip.subtitle) || null}, clips.subtitle),
      format = COALESCE(${clip.format || null}, clips.format),
      updated_at = NOW()
  `;
}

// Get clips for a project
export async function getClipsForProject(projectId: string): Promise<
  Array<{
    id: string;
    name: string;
    startTime: number;
    endTime: number;
    transcriptSegments?: object;
    templateId?: string;
    background?: object;
    subtitle?: object;
    format?: string;
    createdAt: string;
    updatedAt: string;
  }>
> {
  const sql = getDb();

  const rows = await sql`
    SELECT id, name, start_time, end_time, transcript_segments, template_id, background, subtitle, format, created_at, updated_at
    FROM clips
    WHERE project_id = ${projectId}
    ORDER BY start_time ASC
  `;

  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    startTime: row.start_time as number,
    endTime: row.end_time as number,
    transcriptSegments: row.transcript_segments as object | undefined,
    templateId: row.template_id as string | undefined,
    background: row.background as object | undefined,
    subtitle: row.subtitle as object | undefined,
    format: row.format as string | undefined,
    createdAt: toISOStringSafe(row.created_at) as string,
    updatedAt: toISOStringSafe(row.updated_at) as string,
  }));
}

// Delete a clip
export async function deleteClip(id: string): Promise<void> {
  const sql = getDb();

  // Get rendered clips to delete blobs
  const renderedClips = await sql`
    SELECT blob_url FROM rendered_clips WHERE clip_id = ${id}
  `;

  for (const row of renderedClips) {
    try {
      await deleteFromR2ByUrl(row.blob_url as string);
    } catch (e) {
      console.error(`Failed to delete blob: ${row.blob_url}`, e);
    }
  }

  await sql`DELETE FROM clips WHERE id = ${id}`;
}

// Save media asset
export async function saveMediaAsset(asset: {
  id: string;
  projectId?: string;
  type: string;
  name: string;
  blobUrl: string;
  contentType?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  metadata?: object;
}): Promise<void> {
  const sql = getDb();

  await sql`
    INSERT INTO media_assets (id, project_id, type, name, blob_url, content_type, size_bytes, duration_seconds, width, height, metadata)
    VALUES (${asset.id}, ${asset.projectId || null}, ${asset.type}, ${asset.name}, ${asset.blobUrl}, ${asset.contentType || null}, ${asset.sizeBytes || null}, ${asset.durationSeconds || null}, ${asset.width || null}, ${asset.height || null}, ${JSON.stringify(asset.metadata) || null})
  `;
}

// Get media assets for a project
export async function getMediaAssetsForProject(projectId: string): Promise<
  Array<{
    id: string;
    type: string;
    name: string;
    blobUrl: string;
    contentType?: string;
    sizeBytes?: number;
    durationSeconds?: number;
    width?: number;
    height?: number;
    metadata?: object;
    createdAt: string;
  }>
> {
  const sql = getDb();

  const rows = await sql`
    SELECT id, type, name, blob_url, content_type, size_bytes, duration_seconds, width, height, metadata, created_at
    FROM media_assets
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `;

  return rows.map((row) => ({
    id: row.id as string,
    type: row.type as string,
    name: row.name as string,
    blobUrl: row.blob_url as string,
    contentType: row.content_type as string | undefined,
    sizeBytes: row.size_bytes as number | undefined,
    durationSeconds: row.duration_seconds as number | undefined,
    width: row.width as number | undefined,
    height: row.height as number | undefined,
    metadata: row.metadata as object | undefined,
    createdAt: toISOStringSafe(row.created_at) as string,
  }));
}

// Delete media asset
export async function deleteMediaAsset(id: string): Promise<void> {
  const sql = getDb();

  const rows = await sql`
    SELECT blob_url FROM media_assets WHERE id = ${id}
  `;

  if (rows.length > 0) {
    try {
      await deleteFromR2ByUrl(rows[0].blob_url as string);
    } catch (e) {
      console.error(`Failed to delete blob: ${rows[0].blob_url}`, e);
    }
  }

  await sql`DELETE FROM media_assets WHERE id = ${id}`;
}

// Save rendered clip
export async function saveRenderedClip(rendered: {
  id: string;
  clipId: string;
  format: string;
  blobUrl: string;
  sizeBytes?: number;
}): Promise<void> {
  const sql = getDb();

  await sql`
    INSERT INTO rendered_clips (id, clip_id, format, blob_url, size_bytes)
    VALUES (${rendered.id}, ${rendered.clipId}, ${rendered.format}, ${rendered.blobUrl}, ${rendered.sizeBytes || null})
    ON CONFLICT (id)
    DO UPDATE SET
      blob_url = ${rendered.blobUrl},
      size_bytes = ${rendered.sizeBytes || null},
      rendered_at = NOW()
  `;
}

// Get rendered clips for a clip
export async function getRenderedClipsForClip(clipId: string): Promise<
  Array<{
    id: string;
    format: string;
    blobUrl: string;
    sizeBytes?: number;
    renderedAt: string;
  }>
> {
  const sql = getDb();

  const rows = await sql`
    SELECT id, format, blob_url, size_bytes, rendered_at
    FROM rendered_clips
    WHERE clip_id = ${clipId}
    ORDER BY rendered_at DESC
  `;

  return rows.map((row) => ({
    id: row.id as string,
    format: row.format as string,
    blobUrl: row.blob_url as string,
    sizeBytes: row.size_bytes as number | undefined,
    renderedAt: toISOStringSafe(row.rendered_at) as string,
  }));
}
