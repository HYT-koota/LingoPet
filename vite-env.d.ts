// Augment the global NodeJS namespace
declare namespace NodeJS {
  interface ProcessEnv {
    readonly TEXT_API_KEY: string;
    readonly TEXT_API_BASE_URL: string;
    readonly TEXT_API_MODEL: string;
    
    readonly IMAGE_API_KEY: string;
    readonly IMAGE_API_BASE_URL: string;
    readonly IMAGE_API_MODEL: string;
    
    // Legacy/Fallbacks
    readonly API_KEY: string;
    readonly API_BASE_URL: string;
    readonly API_MODEL: string;
    
    [key: string]: string | undefined;
  }
}