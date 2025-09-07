import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User as SelectUser, LoginData } from "@shared/schema";

const adminLoginSchema = {
  username: "",
  password: "",
};

type AdminLoginData = typeof adminLoginSchema;
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { API_BASE } from "../lib/queryClient";
import { setUploadConfig } from "@/lib/native-recorder";
import { Capacitor } from "@capacitor/core";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  adminLoginMutation: UseMutationResult<SelectUser, Error, AdminLoginData>;
  audioAccessMutation: UseMutationResult<{ success: boolean }, Error, { audioPassword: string }>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: async (payload: any) => {
      const user: SelectUser = payload;
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Login successful",
        description: `Welcome, ${user.username}!`,
      });
      // Store bearer token if provided and configure native uploader
      try {
        if (payload?.token) {
          localStorage.setItem("uploadToken", payload.token);
        }
      } catch {}
      if (user.role === "employee" && Capacitor.getPlatform() === "android") {
        (async () => {
          try {
            const token = ((): string | null => {
              try { return localStorage.getItem("uploadToken"); } catch { return null; }
            })();
            if (token) {
              await setUploadConfig(API_BASE || "", token);
              return;
            }
          } catch {}
          // Fallback to API-issued token when cookies are present
          try {
            const res = await apiRequest("POST", "/api/auth/upload-token");
            const { token } = await res.json();
            try { localStorage.setItem("uploadToken", token); } catch {}
            await setUploadConfig(API_BASE || "", token);
          } catch {
            // non-fatal
          }
        })();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Ensure native uploader is configured when user is already logged in (app relaunch)
  useEffect(() => {
    (async () => {
      if (!user) return;
      if (user.role !== "employee") return;
      if (Capacitor.getPlatform() !== "android") return;
      try {
        const token = ((): string | null => {
          try { return localStorage.getItem("uploadToken"); } catch { return null; }
        })();
        if (token) {
          await setUploadConfig(API_BASE || "", token);
          return;
        }
      } catch {}
      try {
        const res = await apiRequest("POST", "/api/auth/upload-token");
        const { token } = await res.json();
        try { localStorage.setItem("uploadToken", token); } catch {}
        await setUploadConfig(API_BASE || "", token);
      } catch {
        // non-fatal
      }
    })();
  }, [user]);


  const adminLoginMutation = useMutation({
    mutationFn: async (credentials: AdminLoginData) => {
      const res = await apiRequest("POST", "/api/admin/login", credentials);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Admin login successful",
        description: "Access granted to admin panel",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Admin login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const audioAccessMutation = useMutation({
    mutationFn: async (data: { audioPassword: string }) => {
      const res = await apiRequest("POST", "/api/admin/audio-access", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Audio access granted",
        description: "Access to audio monitoring panel enabled",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Audio access denied",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      try { localStorage.removeItem("uploadToken"); } catch {}
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        adminLoginMutation,
        audioAccessMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
