import { authService } from "../../../services/auth.service";
import type { LoginCredentials } from "../types/login.types";
import type { AuthResponse } from "../../../types/auth.types";

export const loginPageService = {
  async executeLogin(credentials: LoginCredentials): Promise<AuthResponse> {
    return authService.login(credentials.email, credentials.password);
  },
};
