/**
 * 认证上下文
 * 
 * 提供全局认证状态管理：
 * - 用户信息
 * - Token 管理
 * - 登录/登出功能
 */
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface User {
  id: number;
  phone: string;
  name: string;
  role: string;
  storeId: number;
  storeName?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化时从 AsyncStorage 读取认证信息
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const savedToken = await AsyncStorage.getItem('auth_token');
        const savedUser = await AsyncStorage.getItem('user_info');
        
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      } catch (error) {
        console.error('Failed to load auth state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuthState();
  }, []);

  // 登录：保存 token 和用户信息
  const login = async (newToken: string, userData: User) => {
    try {
      await AsyncStorage.setItem('auth_token', newToken);
      await AsyncStorage.setItem('user_info', JSON.stringify(userData));
      setToken(newToken);
      setUser(userData);
    } catch (error) {
      console.error('Failed to save auth state:', error);
      throw error;
    }
  };

  // 登出：清除 token 和用户信息
  const logout = async () => {
    try {
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('user_info');
      setToken(null);
      setUser(null);
    } catch (error) {
      console.error('Failed to clear auth state:', error);
      throw error;
    }
  };

  // 更新用户信息
  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      AsyncStorage.setItem('user_info', JSON.stringify(updatedUser)).catch(console.error);
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
