import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // Số phiên bản (package.json) hiện ở đầu hộp thoại Luật chơi. Giá trị được nhúng vào code lúc build.
  env: { APP_VERSION: pkg.version },
};

export default nextConfig;
