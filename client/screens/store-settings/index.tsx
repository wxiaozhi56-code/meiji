import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
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

interface StoreInfo {
  id: number;
  name: string;
  address?: string;
  logo_url?: string;
  created_at: string;
}

export default function StoreSettingsScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const { token } = useAuth();

  const [store, setStore] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // 编辑状态
  const [editingName, setEditingName] = useState('');
  const [editingAddress, setEditingAddress] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const fetchStore = useCallback(async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setStore(data.data);
        setEditingName(data.data.name);
        setEditingAddress(data.data.address || '');
      }
    } catch (error) {
      console.error('Failed to fetch store:', error);
      Toast.show({ type: 'error', text1: '获取门店信息失败' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      fetchStore();
    }, [fetchStore])
  );

  const handleSave = async () => {
    if (!editingName.trim()) {
      Toast.show({ type: 'error', text1: '请输入门店名称' });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editingName.trim(),
          address: editingAddress.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '保存失败');
      }

      Toast.show({ type: 'success', text1: '保存成功' });
      setStore(data.data);
      setIsEditing(false);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: '保存失败', text2: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingName(store?.name || '');
    setEditingAddress(store?.address || '');
    setIsEditing(false);
  };

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
          <ThemedText variant="h3" color={theme.textPrimary}>门店设置</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {/* 基本信息 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText variant="labelTitle" color={theme.textMuted}>基本信息</ThemedText>
                {!isEditing && (
                  <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
                    <FontAwesome6 name="pen" size={14} color={theme.primary} />
                    <ThemedText variant="small" color={theme.primary}>编辑</ThemedText>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.infoCard}>
                {/* 门店名称 */}
                <View style={styles.infoRow}>
                  <FontAwesome6 name="store" size={18} color={theme.textMuted} style={styles.infoIcon} />
                  <ThemedText variant="body" color={theme.textMuted} style={styles.infoLabel}>门店名称</ThemedText>
                </View>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={editingName}
                    onChangeText={setEditingName}
                    placeholder="请输入门店名称"
                    placeholderTextColor={theme.textMuted}
                  />
                ) : (
                  <ThemedText variant="h4" color={theme.textPrimary} style={styles.infoValue}>
                    {store?.name || '-'}
                  </ThemedText>
                )}

                {/* 门店地址 */}
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <FontAwesome6 name="location-dot" size={18} color={theme.textMuted} style={styles.infoIcon} />
                  <ThemedText variant="body" color={theme.textMuted} style={styles.infoLabel}>门店地址</ThemedText>
                </View>
                {isEditing ? (
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={editingAddress}
                    onChangeText={setEditingAddress}
                    placeholder="请输入门店地址"
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                ) : (
                  <ThemedText variant="body" color={theme.textPrimary} style={styles.infoValue}>
                    {store?.address || '未设置'}
                  </ThemedText>
                )}
              </View>
            </View>

            {/* 创建时间 */}
            <View style={styles.section}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>创建时间</ThemedText>
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <FontAwesome6 name="calendar" size={18} color={theme.textMuted} style={styles.infoIcon} />
                  <ThemedText variant="body" color={theme.textPrimary}>
                    {store?.created_at ? new Date(store.created_at).toLocaleDateString('zh-CN') : '-'}
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* 保存按钮 */}
            {isEditing && (
              <View style={styles.buttonGroup}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                  <ThemedText variant="bodyMedium" color={theme.textPrimary}>取消</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={theme.buttonPrimaryText} />
                  ) : (
                    <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>保存</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}
      </ThemedView>
      <Toast />
    </Screen>
  );
}
