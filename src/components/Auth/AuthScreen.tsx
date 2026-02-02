import { useState } from "react";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Podcastomatic</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Create viral podcast clips in minutes
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-6 text-xl font-semibold text-gray-900 dark:text-white">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>

          {mode === "login" ? (
            <LoginForm onSwitchToRegister={() => setMode("register")} />
          ) : (
            <RegisterForm onSwitchToLogin={() => setMode("login")} />
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-500">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
