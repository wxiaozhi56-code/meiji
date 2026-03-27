import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface Statistics {
  customerCount: number;
  newCustomerCount: number; // 本月新增
  activeCustomerCount: number; // 近7天活跃
  sleepingCustomerCount: number; // 沉睡客户
  followUpCount: number; // 本月跟进次数
  pendingFollowUpCount: number; // 待跟进
}

export default function StatisticsScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const { token, user } = useAuth();

  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/statistics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [fetchStats])
  );

  const renderStatCard = (
    title: string,
    value: number,
    icon: string,
    color: string,
    onPress?: () => void
  ) => (
    <TouchableOpacity
      style={[styles.statCard, onPress && styles.statCardClickable]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.statIconContainer, { backgroundColor: color + '20' }]}>
        <FontAwesome6 name={icon} size={24} color={color} />
      </View>
      <ThemedText variant="h2" color={theme.textPrimary}>{value}</ThemedText>
      <ThemedText variant="small" color={theme.textMuted}>{title}</ThemedText>
    </TouchableOpacity>
  );

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
          <ThemedText variant="h3" color={theme.textPrimary}>数据统计</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {/* 客户统计 */}
            <View style={styles.section}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>客户概览</ThemedText>
              <View style={styles.statsGrid}>
                {renderStatCard('客户总数', stats?.customerCount || 0, 'users', theme.primary)}
                {renderStatCard('本月新增', stats?.newCustomerCount || 0, 'user-plus', '#10B981')}
              </View>
            </View>

            {/* 客户状态 */}
            <View style={styles.section}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>客户状态</ThemedText>
              <View style={styles.statsGrid}>
                {renderStatCard(
                  '活跃客户',
                  stats?.activeCustomerCount || 0,
                  'heart-pulse',
                  '#3B82F6',
                  () => router.push('/', { filter: 'active' })
                )}
                {renderStatCard(
                  '沉睡客户',
                  stats?.sleepingCustomerCount || 0,
                  'moon',
                  '#F59E0B',
                  () => router.push('/', { filter: 'sleeping' })
                )}
              </View>
            </View>

            {/* 跟进统计 */}
            <View style={styles.section}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>跟进情况</ThemedText>
              <View style={styles.statsGrid}>
                {renderStatCard(
                  '本月跟进',
                  stats?.followUpCount || 0,
                  'clipboard-check',
                  '#8B5CF6'
                )}
                {renderStatCard(
                  '待跟进',
                  stats?.pendingFollowUpCount || 0,
                  'clock',
                  '#EF4444',
                  () => router.push('/', { filter: 'pending' })
                )}
              </View>
            </View>

            {/* 提示信息 */}
            <View style={styles.tipCard}>
              <FontAwesome6 name="lightbulb" size={20} color={theme.accent} />
              <View style={styles.tipContent}>
                <ThemedText variant="smallMedium" color={theme.textPrimary}>数据统计说明</ThemedText>
                <ThemedText variant="tiny" color={theme.textMuted}>
                  • 活跃客户：近7天有跟进记录{'\n'}
                  • 沉睡客户：超过30天未跟进{'\n'}
                  • 待跟进：设置了跟进计划但未完成
                </ThemedText>
              </View>
            </View>
          </ScrollView>
        )}
      </ThemedView>
    </Screen>
  );
}
