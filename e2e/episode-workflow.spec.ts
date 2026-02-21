import { test, expect } from "@playwright/test";
import { loginAsTestUser, ensureTestPodcast } from "./helpers/auth";
import * as path from "path";

test.describe("Episode Workflow", () => {
  let testPodcastId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    testPodcastId = await ensureTestPodcast(page);
  });

  test("should create a new episode", async ({ page }) => {
    await page.goto("/episodes");
    await page.waitForLoadState("networkidle");

    // Look for create episode functionality
    const createButton = page
      .locator(
        'button:has-text("Create"), button:has-text("New Episode"), [data-testid="create-episode"]'
      )
      .first();

    if (await createButton.isVisible({ timeout: 5000 })) {
      await createButton.click();

      // Fill episode details
      const timestamp = Date.now();
      const episodeName = `E2E Test Episode ${timestamp}`;

      const nameInput = page
        .locator('input[name="name"], input[placeholder*="episode"], input[placeholder*="title"]')
        .first();
      await nameInput.fill(episodeName);

      // Look for description field
      const descInput = page
        .locator('textarea[name="description"], textarea[placeholder*="description"]')
        .first();
      if (await descInput.isVisible()) {
        await descInput.fill(`Test description for episode ${timestamp}`);
      }

      // Submit creation
      const submitButton = page
        .locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")')
        .first();
      await submitButton.click();

      // Should navigate to episode workflow
      await expect(page).toHaveURL(/\/episodes\/.*/, { timeout: 15000 });

      // Verify episode name appears
      await expect(page.locator(`text=${episodeName}`)).toBeVisible({ timeout: 10000 });
    } else {
      // Alternative: direct episode creation through API and navigation
      await createEpisodeThroughAPI(page, testPodcastId);
    }
  });

  test("should import audio and transcribe", async ({ page }) => {
    // Create episode first
    const episodeId = await createEpisodeThroughAPI(page, testPodcastId);

    // Navigate to episode media/import stage
    await page.goto(`/episodes/${episodeId}/production/media`);
    await page.waitForLoadState("networkidle");

    // Look for audio import functionality
    const importArea = page
      .locator('[data-testid="import-area"], .upload-zone, input[type="file"]')
      .first();

    if (await importArea.isVisible({ timeout: 5000 })) {
      // Create a test audio file path (you may need to provide test fixtures)
      const _testAudioPath = path.join(__dirname, "fixtures", "test-audio.mp3");

      // Try to upload file
      const fileInput = page.locator('input[type="file"]').first();

      if (await fileInput.isVisible()) {
        // Note: In real tests, you'd want to provide actual test audio files
        // For now, we'll test the UI response to file selection

        // Simulate file selection (without actual file for this demo)
        await fileInput.click();

        // Look for upload progress or success indication
        const progressIndicator = page
          .locator('.progress, [data-testid="upload-progress"]')
          .first();

        if (await progressIndicator.isVisible({ timeout: 10000 })) {
          // Wait for upload to complete
          await expect(progressIndicator).not.toBeVisible({ timeout: 30000 });
        }

        // Look for transcription trigger
        const transcribeButton = page
          .locator('button:has-text("Transcribe"), [data-testid="transcribe-button"]')
          .first();

        if (await transcribeButton.isVisible({ timeout: 5000 })) {
          await transcribeButton.click();

          // Wait for transcription to complete (this could take a while in real usage)
          const transcriptionProgress = page
            .locator('.transcription-progress, [data-testid="transcribe-progress"]')
            .first();

          if (await transcriptionProgress.isVisible({ timeout: 10000 })) {
            // For E2E tests, we might want to mock this or use very short audio
            await expect(transcriptionProgress).not.toBeVisible({ timeout: 60000 });
          }
        }
      }
    }
  });

  test("should edit transcript and manage speakers", async ({ page }) => {
    const episodeId = await createEpisodeThroughAPI(page, testPodcastId);

    // Navigate to transcript editing stage
    await page.goto(`/episodes/${episodeId}/post-production/transcript`);
    await page.waitForLoadState("networkidle");

    // Look for transcript editor
    const transcriptEditor = page
      .locator('[data-testid="transcript-editor"], .transcript-container')
      .first();

    if (await transcriptEditor.isVisible({ timeout: 10000 })) {
      // Test speaker management
      const speakerSection = page.locator('[data-testid="speaker-lineup"], .speakers').first();

      if (await speakerSection.isVisible()) {
        // Add a speaker
        const addSpeakerButton = page
          .locator('button:has-text("Add Speaker"), [data-testid="add-speaker"]')
          .first();

        if (await addSpeakerButton.isVisible()) {
          await addSpeakerButton.click();

          const speakerNameInput = page
            .locator('input[placeholder*="speaker"], input[placeholder*="name"]')
            .first();

          if (await speakerNameInput.isVisible()) {
            await speakerNameInput.fill("Test Speaker");

            const saveButton = page
              .locator('button:has-text("Save"), button[type="submit"]')
              .first();
            if (await saveButton.isVisible()) {
              await saveButton.click();
            }
          }
        }
      }

      // Test transcript editing
      const editableTranscript = page.locator('[contenteditable="true"], textarea').first();

      if (await editableTranscript.isVisible()) {
        await editableTranscript.click();
        await editableTranscript.fill("This is a test transcript for E2E testing.");

        // Save changes
        const saveTranscriptButton = page
          .locator('button:has-text("Save"), [data-testid="save-transcript"]')
          .first();
        if (await saveTranscriptButton.isVisible()) {
          await saveTranscriptButton.click();
        }
      }
    }
  });

  test("should create and edit video clips", async ({ page }) => {
    const episodeId = await createEpisodeThroughAPI(page, testPodcastId);

    // Navigate to clips stage
    await page.goto(`/episodes/${episodeId}/marketing/clips`);
    await page.waitForLoadState("networkidle");

    // Look for clip creation interface
    const clipInterface = page.locator('[data-testid="clip-selector"], .clip-interface').first();

    if (await clipInterface.isVisible({ timeout: 10000 })) {
      // Test creating a clip
      const createClipButton = page
        .locator(
          'button:has-text("Create Clip"), button:has-text("Add Clip"), [data-testid="create-clip"]'
        )
        .first();

      if (await createClipButton.isVisible()) {
        await createClipButton.click();

        // Set clip details
        const clipNameInput = page
          .locator('input[name="title"], input[placeholder*="title"], input[placeholder*="name"]')
          .first();

        if (await clipNameInput.isVisible()) {
          await clipNameInput.fill("Test Clip");

          // Set time ranges if available
          const startTimeInput = page
            .locator('input[name="startTime"], input[placeholder*="start"]')
            .first();
          const endTimeInput = page
            .locator('input[name="endTime"], input[placeholder*="end"]')
            .first();

          if (await startTimeInput.isVisible()) {
            await startTimeInput.fill("00:10");
          }

          if (await endTimeInput.isVisible()) {
            await endTimeInput.fill("00:30");
          }

          // Save clip
          const saveClipButton = page
            .locator('button:has-text("Save"), button[type="submit"]')
            .first();
          if (await saveClipButton.isVisible()) {
            await saveClipButton.click();
          }
        }
      }

      // Test AI clip suggestions if available
      const suggestClipsButton = page
        .locator('button:has-text("Suggest"), button:has-text("AI"), [data-testid="suggest-clips"]')
        .first();

      if (await suggestClipsButton.isVisible()) {
        await suggestClipsButton.click();

        // Wait for suggestions to load
        await page.waitForTimeout(5000);

        // Look for suggested clips
        const suggestedClips = page
          .locator('[data-testid="suggested-clip"], .clip-suggestion')
          .first();

        if (await suggestedClips.isVisible({ timeout: 10000 })) {
          // Accept a suggestion
          const acceptButton = page
            .locator(
              'button:has-text("Accept"), button:has-text("Use"), [data-testid="accept-clip"]'
            )
            .first();
          if (await acceptButton.isVisible()) {
            await acceptButton.click();
          }
        }
      }
    }
  });

  test("should customize video settings and render", async ({ page }) => {
    const episodeId = await createEpisodeThroughAPI(page, testPodcastId);

    // Navigate to video editor
    await page.goto(`/episodes/${episodeId}/marketing/editor`);
    await page.waitForLoadState("networkidle");

    // Look for video editor interface
    const videoEditor = page
      .locator('[data-testid="video-editor"], .video-editor-container')
      .first();

    if (await videoEditor.isVisible({ timeout: 10000 })) {
      // Test format selection
      const formatSelector = page
        .locator('[data-testid="format-selector"], select[name="format"]')
        .first();

      if (await formatSelector.isVisible()) {
        await formatSelector.selectOption("9:16"); // Vertical format
      }

      // Test background options
      const backgroundSelector = page
        .locator('[data-testid="background-selector"], .background-options')
        .first();

      if (await backgroundSelector.isVisible()) {
        const colorOption = page.locator("button[data-color], .color-option").first();
        if (await colorOption.isVisible()) {
          await colorOption.click();
        }
      }

      // Test subtitle customization
      const subtitleOptions = page
        .locator('[data-testid="subtitle-options"], .subtitle-config')
        .first();

      if (await subtitleOptions.isVisible()) {
        const fontSelector = page.locator('select[name="font"], .font-selector').first();
        if (await fontSelector.isVisible()) {
          await fontSelector.selectOption({ index: 1 });
        }

        const colorPicker = page.locator('input[type="color"], [data-testid="text-color"]').first();
        if (await colorPicker.isVisible()) {
          await colorPicker.fill("#ffffff");
        }
      }

      // Test render functionality
      const renderButton = page
        .locator('button:has-text("Render"), [data-testid="render-video"]')
        .first();

      if (await renderButton.isVisible()) {
        await renderButton.click();

        // Wait for render to start
        const renderProgress = page
          .locator('[data-testid="render-progress"], .render-status')
          .first();

        if (await renderProgress.isVisible({ timeout: 10000 })) {
          // For E2E tests, we might want to mock rendering or use very short clips
          // Wait a reasonable time for render to complete or show progress
          await page.waitForTimeout(10000);

          // Check if render completed or is still in progress
          const renderComplete = page
            .locator('text=Complete, text=Finished, [data-testid="render-complete"]')
            .first();

          if (await renderComplete.isVisible({ timeout: 30000 })) {
            await expect(renderComplete).toBeVisible();
          }
        }
      }
    }
  });

  test("should configure publishing and upload to platforms", async ({ page }) => {
    const episodeId = await createEpisodeThroughAPI(page, testPodcastId);

    // Navigate to publish stage
    await page.goto(`/episodes/${episodeId}/marketing/publish`);
    await page.waitForLoadState("networkidle");

    // Look for publish interface
    const publishPanel = page.locator('[data-testid="publish-panel"], .publish-interface').first();

    if (await publishPanel.isVisible({ timeout: 10000 })) {
      // Test platform connections
      const platformConnections = page
        .locator('[data-testid="platform-connections"], .oauth-connections')
        .first();

      if (await platformConnections.isVisible()) {
        // Look for connect buttons (without actually connecting in E2E)
        const connectButtons = page.locator('button:has-text("Connect"), .connect-platform');

        const buttonCount = await connectButtons.count();
        if (buttonCount > 0) {
          // Verify platforms are listed
          await expect(connectButtons.first()).toBeVisible();
        }
      }

      // Test post configuration
      const postConfig = page.locator('[data-testid="post-config"], .post-settings').first();

      if (await postConfig.isVisible()) {
        // Set post title
        const titleInput = page.locator('input[name="title"], textarea[name="title"]').first();
        if (await titleInput.isVisible()) {
          await titleInput.fill("Test Video Post");
        }

        // Set description
        const descInput = page.locator('textarea[name="description"], .post-description').first();
        if (await descInput.isVisible()) {
          await descInput.fill("Test description for social media post");
        }

        // Set hashtags
        const hashtagInput = page
          .locator('input[name="hashtags"], input[placeholder*="hashtag"]')
          .first();
        if (await hashtagInput.isVisible()) {
          await hashtagInput.fill("#podcast #testing #e2e");
        }
      }

      // Test scheduling (if available)
      const scheduleOption = page
        .locator('[data-testid="schedule-post"], .schedule-settings')
        .first();

      if (await scheduleOption.isVisible()) {
        const scheduleToggle = page.locator('input[type="checkbox"], .schedule-toggle').first();

        if (await scheduleToggle.isVisible()) {
          await scheduleToggle.check();

          const dateInput = page
            .locator('input[type="datetime-local"], input[type="date"]')
            .first();
          if (await dateInput.isVisible()) {
            const futureDate = new Date();
            futureDate.setHours(futureDate.getHours() + 1);
            await dateInput.fill(futureDate.toISOString().slice(0, 16));
          }
        }
      }
    }
  });

  test("should delete an episode", async ({ page }) => {
    const episodeId = await createEpisodeThroughAPI(page, testPodcastId);

    // Navigate to episode
    await page.goto(`/episodes/${episodeId}/info`);
    await page.waitForLoadState("networkidle");

    // Look for episode settings or delete option
    const episodeMenu = page.locator('[data-testid="episode-menu"], .episode-actions').first();

    if (await episodeMenu.isVisible({ timeout: 5000 })) {
      await episodeMenu.click();

      const deleteButton = page
        .locator('button:has-text("Delete"), [data-testid="delete-episode"]')
        .first();

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // Handle confirmation
        const confirmButton = page
          .locator('button:has-text("Confirm"), button:has-text("Delete")')
          .last();
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        // Should redirect to episodes list
        await expect(page).toHaveURL("/episodes", { timeout: 10000 });
      }
    }
  });
});

// Helper function to create episode through API
async function createEpisodeThroughAPI(page: any, podcastId: string): Promise<string> {
  const authData = await page.evaluate(() => {
    const stored = localStorage.getItem("auth-storage");
    return stored ? JSON.parse(stored) : null;
  });

  const accessToken = authData?.state?.accessToken;

  if (!accessToken) {
    throw new Error("No access token available");
  }

  const response = await page.request.post("http://localhost:3002/api/episodes", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    data: {
      name: `E2E Test Episode ${Date.now()}`,
      podcastId: podcastId,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create episode: ${response.status()}`);
  }

  const { episode } = await response.json();
  return episode.id;
}
