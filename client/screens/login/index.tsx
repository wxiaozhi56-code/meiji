import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

export default function LoginScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const { login } = useAuth();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!phone.trim()) {
      Toast.show({
        type: 'error',
        text1: '请输入手机号',
      });
      return;
    }

    if (!password.trim()) {
      Toast.show({
        type: 'error',
        text1: '请输入密码',
      });
      return;
    }

    setLoading(true);
    try {
      /**
       * 服务端文件：server/src/routes/auth.routes.ts
       * 接口：POST /api/v1/auth/login
       * Body 参数：phone: string, password: string
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: phone.trim(), 
          password: password.trim() 
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '登录失败');
      }

      // 使用 AuthContext 保存登录状态
      await login(data.data.token, data.data.user);

      Toast.show({
        type: 'success',
        text1: '登录成功',
        text2: `欢迎回来，${data.data.user.name}！`,
      });

      // 延迟跳转到首页
      setTimeout(() => {
        router.replace('/');
      }, 1000);
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: '登录失败',
        text2: error.message || '请检查手机号和密码',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ThemedView level="root" style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Logo and Title */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <FontAwesome6 name="spa" size={48} color={theme.primary} />
              </View>
              <ThemedText variant="h1" color={theme.textPrimary}>
                美迹AI
              </ThemedText>
              <ThemedText variant="body" color={theme.textMuted}>
                智能客户关系管理助手
              </ThemedText>
            </View>

            {/* Login Form */}
            <View style={styles.form}>
              {/* Phone Input */}
              <View style={styles.inputGroup}>
                <ThemedText variant="labelTitle" color={theme.textMuted}>
                  手机号
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <FontAwesome6 name="phone" size={16} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="请输入手机号"
                    placeholderTextColor={theme.textMuted}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    maxLength={11}
                  />
                </View>
              </View>

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <ThemedText variant="labelTitle" color={theme.textMuted}>
                  密码
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <FontAwesome6 name="lock" size={16} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="请输入密码"
                    placeholderTextColor={theme.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    maxLength={20}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                  >
                    <FontAwesome6
                      name={showPassword ? "eye" : "eye-slash"}
                      size={16}
                      color={theme.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Login Button */}
              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.buttonPrimaryText} />
                ) : (
                  <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>
                    登录
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </ThemedView>
      </KeyboardAvoidingView>
      <Toast />
    </Screen>
  );
}
