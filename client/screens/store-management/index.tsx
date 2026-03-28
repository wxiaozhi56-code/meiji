import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
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

interface Store {
  id: number;
  name: string;
  owner_phone: string;
  address?: string;
  package_type: string;
  status: string;
  created_at: string;
  owner?: {
    id: number;
    name: string;
    phone: string;
    role: string;
    status: string;
  };
}

export default function StoreManagementScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const { token } = useAuth();

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStores = useCallback(async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      /**
       * 服务端文件：server/src/routes/store.routes.ts
       * 接口：GET /api/v1/stores/all
       * 需要认证：Bearer token（超级管理员权限）
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/all`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setStores(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch stores:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      fetchStores();
    }, [fetchStores])
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  const handleDeleteStore = (store: Store) => {
    showAlert(
      '确认删除',
      `确定要删除门店「${store.name}」吗？\n\n删除后，该门店的所有数据将无法恢复，老板账号也将被禁用。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              /**
               * 服务端文件：server/src/routes/store.routes.ts
               * 接口：DELETE /api/v1/stores/:id
               * 需要认证：Bearer token（超级管理员权限）
               */
              const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/${store.id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });

              const data = await response.json();

              if (!response.ok || !data.success) {
                throw new Error(data.error || '删除失败');
              }

              Toast.show({
                type: 'success',
                text1: '删除成功',
                text2: data.message,
              });

              fetchStores();
            } catch (error: any) {
              Toast.show({
                type: 'error',
                text1: '删除失败',
                text2: error.message,
              });
            }
          },
        },
      ]
    );
  };

  const renderStoreCard = (store: Store) => {
    const owner = store.owner;
    const isActive = store.status === 'active';

    return (
      <View key={store.id} style={styles.storeCard}>
        <View style={styles.storeHeader}>
          <View style={styles.storeInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ThemedText variant="h4" color={theme.textPrimary} style={styles.storeName}>
                {store.name}
              </ThemedText>
              <View style={[
                styles.statusBadge,
                isActive ? styles.statusActive : styles.statusInactive
              ]}>
                <ThemedText variant="tiny" color={isActive ? '#10B981' : '#EF4444'}>
                  {isActive ? '正常' : '已禁用'}
                </ThemedText>
              </View>
            </View>
            <View style={styles.storeMeta}>
              <View style={styles.storeMetaItem}>
                <FontAwesome6 name="calendar" size={12} color={theme.textMuted} />
                <ThemedText variant="caption" color={theme.textMuted}>
                  创建于 {formatDate(store.created_at)}
                </ThemedText>
              </View>
            </View>
          </View>
        </View>

        {store.address && (
          <View style={[styles.storeMetaItem, { marginBottom: 8 }]}>
            <FontAwesome6 name="location-dot" size={12} color={theme.textMuted} />
            <ThemedText variant="small" color={theme.textSecondary}>
              {store.address}
            </ThemedText>
          </View>
        )}

        {owner && (
          <View style={styles.ownerInfo}>
            <View style={styles.ownerAvatar}>
              <ThemedText variant="smallMedium" color={theme.buttonPrimaryText}>
                {owner.name.charAt(0)}
              </ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText variant="smallMedium" color={theme.textPrimary}>
                {owner.name}
              </ThemedText>
              <ThemedText variant="caption" color={theme.textMuted}>
                {owner.phone}
              </ThemedText>
            </View>
            <View style={[styles.statusBadge, owner.status === 'active' ? styles.statusActive : styles.statusInactive]}>
              <ThemedText variant="tiny" color={owner.status === 'active' ? '#10B981' : '#EF4444'}>
                {owner.status === 'active' ? '正常' : '已禁用'}
              </ThemedText>
            </View>
          </View>
        )}

        {/* 删除按钮 */}
        {store.status !== 'deleted' && (
          <TouchableOpacity 
            style={styles.deleteButton} 
            onPress={() => handleDeleteStore(store)}
          >
            <FontAwesome6 name="trash" size={14} color={theme.error} />
            <ThemedText variant="caption" color={theme.error}>删除门店</ThemedText>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const activeStores = stores.filter(s => s.status === 'active');
  const inactiveStores = stores.filter(s => s.status !== 'active');

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
          <ThemedText variant="h3" color={theme.textPrimary}>门店管理</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {/* Stats Card */}
            <View style={styles.statsCard}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <View style={styles.statValue}>
                    <ThemedText variant="h2" color={theme.buttonPrimaryText}>
                      {stores.length}
                    </ThemedText>
                  </View>
                  <ThemedText variant="small" color={theme.buttonPrimaryText}>
                    门店总数
                  </ThemedText>
                </View>
                <View style={styles.statItem}>
                  <View style={styles.statValue}>
                    <ThemedText variant="h2" color={theme.buttonPrimaryText}>
                      {activeStores.length}
                    </ThemedText>
                  </View>
                  <ThemedText variant="small" color={theme.buttonPrimaryText}>
                    正常运营
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Active Stores */}
            {activeStores.length > 0 && (
              <View style={{ marginBottom: Spacing.xl }}>
                <View style={styles.sectionHeader}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>
                    正常运营 ({activeStores.length})
                  </ThemedText>
                </View>
                {activeStores.map(renderStoreCard)}
              </View>
            )}

            {/* Inactive Stores */}
            {inactiveStores.length > 0 && (
              <View>
                <View style={styles.sectionHeader}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>
                    已禁用 ({inactiveStores.length})
                  </ThemedText>
                </View>
                {inactiveStores.map(renderStoreCard)}
              </View>
            )}

            {/* Empty State */}
            {stores.length === 0 && (
              <View style={styles.emptyContainer}>
                <FontAwesome6 name="store" size={48} color={theme.textMuted} />
                <ThemedText variant="body" color={theme.textMuted}>
                  暂无门店
                </ThemedText>
              </View>
            )}
          </ScrollView>
        )}
      </ThemedView>
    </Screen>
  );
}

const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '5xl': 48,
};
