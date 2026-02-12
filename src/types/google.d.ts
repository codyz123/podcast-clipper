// Google API type declarations

declare global {
  interface GooglePickerCallbackData {
    action: string;
    docs?: Array<{
      id: string;
      name: string;
      mimeType: string;
      url: string;
    }>;
  }

  interface GooglePickerBuilder {
    addView: (view: GooglePickerDocsView) => GooglePickerBuilder;
    setOAuthToken: (token: string) => GooglePickerBuilder;
    setDeveloperKey: (key: string) => GooglePickerBuilder;
    setCallback: (callback: (data: GooglePickerCallbackData) => void) => GooglePickerBuilder;
    setTitle: (title: string) => GooglePickerBuilder;
    build: () => {
      setVisible: (visible: boolean) => void;
    };
  }

  interface GooglePickerDocsView {
    setIncludeFolders: (include: boolean) => GooglePickerDocsView;
    setMimeTypes: (types: string) => GooglePickerDocsView;
  }

  interface Window {
    gapi: {
      load: (api: string, callback: () => void) => void;
      auth2?: {
        getAuthInstance: () => {
          signIn: () => Promise<void>;
          currentUser?: {
            get: () => {
              getAuthResponse: () => {
                access_token: string;
              };
            };
          };
        };
      };
    };
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new () => GooglePickerDocsView;
      };
    };
  }
}

export {};
