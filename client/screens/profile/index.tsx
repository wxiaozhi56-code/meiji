import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

// 角色名称映射
const ROLE_NAMES: Record<string, string> = {
  super_admin: '超级管理员',
  store_owner: '门店老板',
  store_manager: '门店店长',
  beautician: '美容师',
};

// 跨平台提示函数
const showAlert = (title: string, message: string, buttons?: { text: string; style?: string; onPress?: () => void }[]) => {
  if (Platform.OS === 'web') {
    if (buttons && buttons.length > 1) {
      if (window.confirm(`${title}\n${message}`)) {
        buttons[1].onPress?.();
      }
    } else {
      window.alert(`${title}\n${message}`);
      if (buttons && buttons.length > 0 && buttons[0].onPress) {
        buttons[0].onPress();
      }
    }
  } else {
    Alert.alert(title, message, buttons as any);
  }
};

interface StoreInfo {
  id: number;
  name: string;
  address?: string;
  logo_url?: string;
}

export default function ProfileScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const { user, logout, token } = useAuth();

  const [store, setStore] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  
  // 修改密码弹窗
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const fetchStore = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setStore(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch store:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      fetchStore();
    }, [fetchStore])
  );

  const handleChangePassword = async () => {
    if (!oldPassword.trim()) {
      Toast.show({ type: 'error', text1: '请输入旧密码' });
      return;
    }

    if (!newPassword.trim() || newPassword.length < 6) {
      Toast.show({ type: 'error', text1: '新密码长度至少6位' });
      return;
    }

    if (newPassword !== confirmPassword) {
      Toast.show({ type: 'error', text1: '两次输入的密码不一致' });
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/auth/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          oldPassword: oldPassword.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '修改失败');
      }

      Toast.show({
        type: 'success',
        text1: '密码修改成功',
        text2: '请使用新密码登录',
      });

      setShowPasswordModal(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // 退出登录
      setTimeout(async () => {
        await logout();
        router.replace('/login');
      }, 1500);
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: '修改失败',
        text2: error.message,
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = () => {
    showAlert(
      '退出登录',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
          <ThemedText variant="h3" color={theme.textPrimary}>个人中心</ThemedText>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* 用户信息卡片 */}
          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <ThemedText variant="h2" color={theme.primary}>
                {user?.name?.charAt(0) || '?'}
              </ThemedText>
            </View>
            <View style={styles.userInfo}>
              <ThemedText variant="h3" color={theme.textPrimary}>{user?.name}</ThemedText>
              <ThemedText variant="small" color={theme.textMuted}>{user?.phone}</ThemedText>
              <View style={styles.roleBadge}>
                <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                  {ROLE_NAMES[user?.role || ''] || user?.role}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* 门店信息 */}
          <View style={styles.section}>
            <ThemedText variant="labelTitle" color={theme.textMuted}>门店信息</ThemedText>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <FontAwesome6 name="store" size={16} color={theme.textMuted} />
                <ThemedText variant="body" color={theme.textPrimary}>{store?.name || '未绑定门店'}</ThemedText>
              </View>
              {store?.address && (
                <View style={styles.infoRow}>
                  <FontAwesome6 name="location-dot" size={16} color={theme.textMuted} />
                  <ThemedText variant="body" color={theme.textSecondary}>{store.address}</ThemedText>
                </View>
              )}
            </View>
          </View>

          {/* 功能菜单 */}
          <View style={styles.section}>
            <ThemedText variant="labelTitle" color={theme.textMuted}>设置</ThemedText>
            
            {/* 超级管理员：创建门店账号 */}
            {user?.role === 'super_admin' && (
              <TouchableOpacity style={[styles.menuItem, styles.menuItemHighlight]} onPress={() => router.push('/create-store-owner')}>
                <View style={[styles.menuIcon, { backgroundColor: theme.primary }]}>
                  <FontAwesome6 name="plus" size={18} color={theme.buttonPrimaryText} />
                </View>
                <ThemedText variant="bodyMedium" color={theme.primary}>创建门店账号</ThemedText>
                <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            )}

            {/* 修改密码 */}
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowPasswordModal(true)}>
              <View style={styles.menuIcon}>
                <FontAwesome6 name="key" size={18} color={theme.primary} />
              </View>
              <ThemedText variant="body" color={theme.textPrimary}>修改密码</ThemedText>
              <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
            </TouchableOpacity>

            {/* 门店设置 - 只有老板可见 */}
            {user?.role === 'store_owner' && (
              <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/store-settings')}>
                <View style={styles.menuIcon}>
                  <FontAwesome6 name="gear" size={18} color={theme.primary} />
                </View>
                <ThemedText variant="body" color={theme.textPrimary}>门店设置</ThemedText>
                <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            )}

            {/* 数据统计 - 老板和店长可见 */}
            {(user?.role === 'store_owner' || user?.role === 'store_manager') && (
              <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/statistics')}>
                <View style={styles.menuIcon}>
                  <FontAwesome6 name="chart-line" size={18} color={theme.primary} />
                </View>
                <ThemedText variant="body" color={theme.textPrimary}>数据统计</ThemedText>
                <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* 退出登录 */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <FontAwesome6 name="right-from-bracket" size={18} color={theme.error} />
            <ThemedText variant="bodyMedium" color={theme.error}>退出登录</ThemedText>
          </TouchableOpacity>
        </ScrollView>

        {/* 修改密码弹窗 */}
        <Modal
          visible={showPasswordModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPasswordModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowPasswordModal(false)}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <ThemedText variant="h3" color={theme.textPrimary}>修改密码</ThemedText>
                <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
                  <FontAwesome6 name="xmark" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>旧密码</ThemedText>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="请输入旧密码"
                    placeholderTextColor={theme.textMuted}
                    value={oldPassword}
                    onChangeText={setOldPassword}
                    secureTextEntry
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>新密码</ThemedText>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="请输入新密码（至少6位）"
                    placeholderTextColor={theme.textMuted}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>确认新密码</ThemedText>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="请再次输入新密码"
                    placeholderTextColor={theme.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                </View>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowPasswordModal(false)}
                >
                  <ThemedText variant="bodyMedium" color={theme.textPrimary}>取消</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitButton, changingPassword && styles.modalSubmitButtonDisabled]}
                  onPress={handleChangePassword}
                  disabled={changingPassword}
                >
                  {changingPassword ? (
                    <ActivityIndicator size="small" color={theme.buttonPrimaryText} />
                  ) : (
                    <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>确定</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ThemedView>
      <Toast />
    </Screen>
  );
}
