import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { anonymousClient } from "better-auth/client/plugins";

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

export const authClient = createAuthClient({
  baseURL: API_BASE,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [anonymousClient(), passkeyClient()],
});
