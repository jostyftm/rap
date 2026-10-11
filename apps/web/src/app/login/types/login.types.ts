export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginFormState {
  isSubmitting: boolean;
  error: string | null;
}
