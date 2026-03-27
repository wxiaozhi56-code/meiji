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
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

export default function RegisterScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();

  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async () => {
    // 表单验证
    if (!storeName.trim()) {
      Toast.show({ type: 'error', text1: '请输入门店名称' });
      return;
    }

    if (!ownerName.trim()) {
      Toast.show({ type: 'error', text1: '请输入老板姓名' });
      return;
    }

    if (!phone.trim()) {
      Toast.show({ type: 'error', text1: '请输入手机号' });
      return;
    }

    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      Toast.show({ type: 'error', text1: '手机号格式不正确' });
      return;
    }

    if (!password.trim()) {
      Toast.show({ type: 'error', text1: '请输入密码' });
      return;
    }

    if (password.trim().length < 6) {
      Toast.show({ type: 'error', text1: '密码长度至少6位' });
      return;
    }

    if (password !== confirmPassword) {
      Toast.show({ type: 'error', text1: '两次输入的密码不一致' });
      return;
    }

    setLoading(true);
    try {
      /**
       * 服务端文件：server/src/routes/auth.routes.ts
       * 接口：POST /api/v1/auth/register/store
       * Body 参数：storeName: string, ownerPhone: string, password: string, ownerName: string, address?: string
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/auth/register/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: storeName.trim(),
          ownerPhone: phone.trim(),
          password: password.trim(),
          ownerName: ownerName.trim(),
          address: address.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '注册失败');
      }

      Toast.show({
        type: 'success',
        text1: '注册成功',
        text2: '请使用手机号登录',
      });

      // 延迟跳转到登录页
      setTimeout(() => {
        router.replace('/login');
      }, 1500);
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: '注册失败',
        text2: error.message || '请重试',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    router.back();
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
            {/* Header */}
            <View style={styles.header}>
              <FontAwesome6 name="store" size={48} color={theme.primary} />
              <ThemedText variant="h2" color={theme.textPrimary}>
                门店注册
              </ThemedText>
              <ThemedText variant="small" color={theme.textMuted}>
                创建您的美容院账号
              </ThemedText>
            </View>

            {/* Register Form */}
            <View style={styles.form}>
              {/* Store Name */}
              <View style={styles.inputGroup}>
                <ThemedText variant="labelTitle" color={theme.textMuted}>
                  门店名称 *
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <FontAwesome6 name="store" size={16} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="请输入门店名称"
                    placeholderTextColor={theme.textMuted}
                    value={storeName}
                    onChangeText={setStoreName}
                    maxLength={50}
                  />
                </View>
              </View>

              {/* Owner Name */}
              <View style={styles.inputGroup}>
                <ThemedText variant="labelTitle" color={theme.textMuted}>
                  您的姓名 *
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <FontAwesome6 name="user" size={16} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="请输入您的姓名"
                    placeholderTextColor={theme.textMuted}
                    value={ownerName}
                    onChangeText={setOwnerName}
                    maxLength={20}
                  />
                </View>
              </View>

              {/* Phone */}
              <View style={styles.inputGroup}>
                <ThemedText variant="labelTitle" color={theme.textMuted}>
                  手机号 *
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

              {/* Password */}
              <View style={styles.inputGroup}>
                <ThemedText variant="labelTitle" color={theme.textMuted}>
                  密码 *
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <FontAwesome6 name="lock" size={16} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="至少6位密码"
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

              {/* Confirm Password */}
              <View style={styles.inputGroup}>
                <ThemedText variant="labelTitle" color={theme.textMuted}>
                  确认密码 *
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <FontAwesome6 name="lock" size={16} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="请再次输入密码"
                    placeholderTextColor={theme.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    maxLength={20}
                  />
                </View>
              </View>

              {/* Address */}
              <View style={styles.inputGroup}>
                <ThemedText variant="labelTitle" color={theme.textMuted}>
                  门店地址
                </ThemedText>
                <View style={styles.inputWrapper}>
                  <FontAwesome6 name="location-dot" size={16} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="请输入门店地址（选填）"
                    placeholderTextColor={theme.textMuted}
                    value={address}
                    onChangeText={setAddress}
                    maxLength={200}
                  />
                </View>
              </View>

              {/* Register Button */}
              <TouchableOpacity
                style={[styles.registerButton, loading && styles.registerButtonDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.buttonPrimaryText} />
                ) : (
                  <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>
                    注册
                  </ThemedText>
                )}
              </TouchableOpacity>

              {/* Login Link */}
              <View style={styles.loginLink}>
                <ThemedText variant="small" color={theme.textMuted}>
                  已有账号？
                </ThemedText>
                <TouchableOpacity onPress={handleGoToLogin}>
                  <ThemedText variant="smallMedium" color={theme.primary}>
                    立即登录
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </ThemedView>
      </KeyboardAvoidingView>
      <Toast />
    </Screen>
  );
}
