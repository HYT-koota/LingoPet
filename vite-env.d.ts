// Augment the global NodeJS namespace to include API_KEY in ProcessEnv
// This ensures API_KEY is typed without shadowing the global 'process' variable
declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
    [key: string]: string | undefined;
  }
}
