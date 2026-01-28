// Google API type declarations

declare global {
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
        PickerBuilder: new () => {
          addView: (view: any) => any;
          setOAuthToken: (token: string) => any;
          setDeveloperKey: (key: string) => any;
          setCallback: (callback: (data: any) => void) => any;
          setTitle: (title: string) => any;
          build: () => {
            setVisible: (visible: boolean) => void;
          };
        };
        DocsView: new () => {
          setIncludeFolders: (include: boolean) => any;
          setMimeTypes: (types: string) => any;
        };
      };
    };
  }
}

export {};
