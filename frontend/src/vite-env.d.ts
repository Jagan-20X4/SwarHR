/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ATS_URL: string;
  readonly VITE_PUBLIC_APP_URL: string;
  readonly VITE_API_URL: string;
  readonly VITE_CLAUDE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    CLAUDE_API_URL?: string;
    HR_FRONTEND_MODE?: string;
    HR_FRONTEND_URL?: string;
    HR_PASS_SWAR_TOKEN?: boolean;
    HR_TOKEN_QUERY_PARAM?: string;
    __ATS_URL__?: string;
    __PUBLIC_APP_URL__?: string;
    mammoth?: {
      extractRawText: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value?: string }>;
    };
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}

export {};
