export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // Gemini API
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",

  // Tencent COS
  tencentCosSecretId: process.env.TENCENT_COS_SECRET_ID ?? "",
  tencentCosSecretKey: process.env.TENCENT_COS_SECRET_KEY ?? "",
  tencentCosBucket: process.env.TENCENT_COS_BUCKET ?? "",
  tencentCosRegion: process.env.TENCENT_COS_REGION ?? "ap-shanghai",
  tencentCosCdnUrl: process.env.TENCENT_COS_CDN_URL ?? "",
};
