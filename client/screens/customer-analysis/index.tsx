import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface AnalysisReport {
  id: number;
  customer_id: number;
  consumption_rating: number;
  consumption_potential: string;
  lifecycle_stage: string;
  ltv_estimate: number;
  emotional_state?: string;
  skin_condition?: string;
  life_events?: string;
  visit_frequency: string;
  churn_risk: string;
  top_needs?: string;
  unmet_needs?: string;
  interests?: string;
  best_timing?: string;
  best_channel?: string;
  suggested_staff?: string;
  communication_style?: string;
  primary_recommendation?: string;
  secondary_recommendation?: string;
  avoid_items?: string;
  pitch_angle?: string;
  discount_strategy?: string;
  churn_alert?: string;
  complaint_alert?: string;
  price_sensitivity: string;
  full_report?: string;
  created_at: string;
  expires_at: string;
}

interface Customer {
  id: number;
  name: string;
  phone?: string;
}

export default function CustomerAnalysisScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ customerId: number; customerName?: string }>();
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  // 认证检查
  useFocusEffect(
    useCallback(() => {
      if (authLoading) return;
      
      if (!isAuthenticated) {
        router.replace('/login');
      }
    }, [authLoading, isAuthenticated, router])
  );

  useEffect(() => {
    if (params.customerId && token) {
      fetchCustomer();
      fetchReport();
    }
  }, [params.customerId, token]);

  const fetchCustomer = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers/${params.customerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success && result.data) {
        setCustomer(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch customer:', error);
    }
  }, [params.customerId, token]);

  const fetchReport = useCallback(async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/analysis/${params.customerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success && data.report) {
        setReport(data.report);
      } else {
        setReport(null);
      }
    } catch (error) {
      console.error('Failed to fetch report:', error);
    } finally {
      setLoading(false);
    }
  }, [params.customerId, token]);

  const handleGenerate = async () => {
    if (!token) {
      router.replace('/login');
      return;
    }
    
    setGenerating(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/analysis/generate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ customerId: params.customerId }),
      });
      const data = await response.json();
      if (data.success) {
        setReport(data.report);
      }
    } catch (error) {
      console.error('Failed to generate analysis:', error);
    } finally {
      setGenerating(false);
    }
  };

  const getRatingStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <FontAwesome6 key={i} name="star" size={16} color={i <= rating ? '#FFD700' : theme.textMuted} />
      );
    }
    return stars;
  };

  const getColor = (level: string) => {
    switch (level) {
      case 'high': return theme.success;
      case 'medium': return '#FF9500';
      case 'low': return theme.textMuted;
      default: return theme.textMuted;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return theme.error;
      case 'medium': return '#FF9500';
      case 'low': return theme.success;
      default: return theme.textMuted;
    }
  };

  const getLifecycleLabel = (stage: string) => {
    const labels: Record<string, string> = {
      new: '新客', growing: '成长期', mature: '成熟期', dormant: '休眠期', churned: '流失期',
    };
    return labels[stage] || stage;
  };

  const parseJsonArray = (jsonStr?: string): string[] => {
    if (!jsonStr) return [];
    try { return JSON.parse(jsonStr); } catch { return []; }
  };

  if (loading) {
    return (
      <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
        <ThemedView level="root" style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </ThemedView>
      </Screen>
    );
  }

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
          <ThemedText variant="h3" color={theme.textPrimary}>深度分析</ThemedText>
          <TouchableOpacity style={styles.generateButton} onPress={handleGenerate} disabled={generating}>
            {generating ? (
              <ActivityIndicator size="small" color={theme.buttonPrimaryText} />
            ) : (
              <FontAwesome6 name="wand-magic-sparkles" size={18} color={theme.buttonPrimaryText} />
            )}
          </TouchableOpacity>
        </View>

        {customer && (
          <View style={styles.customerBar}>
            <View style={styles.customerAvatar}>
              <ThemedText variant="h4" color={theme.primary}>{customer.name.charAt(0)}</ThemedText>
            </View>
            <View>
              <ThemedText variant="title" color={theme.textPrimary}>{customer.name}</ThemedText>
              {report && (
                <ThemedText variant="caption" color={theme.textMuted}>
                  分析时间：{new Date(report.created_at).toLocaleString('zh-CN')}
                </ThemedText>
              )}
            </View>
          </View>
        )}

        {!report ? (
          <View style={styles.emptyContainer}>
            <FontAwesome6 name="chart-pie" size={64} color={theme.textMuted} />
            <ThemedText variant="body" color={theme.textMuted}>暂无分析报告</ThemedText>
            <TouchableOpacity style={styles.generateButtonLarge} onPress={handleGenerate}>
              <FontAwesome6 name="wand-magic-sparkles" size={20} color={theme.buttonPrimaryText} />
              <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>一键生成深度分析</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* 客户价值评估 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome5 name="crown" size={20} color="#FFD700" />
                <ThemedText variant="title" color={theme.textPrimary}>客户价值评估</ThemedText>
              </View>
              <View style={styles.card}>
                <View style={styles.valueRow}>
                  <ThemedText variant="small" color={theme.textMuted}>消费能力</ThemedText>
                  <View style={styles.ratingStars}>{getRatingStars(report.consumption_rating)}</View>
                </View>
                <View style={styles.valueRow}>
                  <ThemedText variant="small" color={theme.textMuted}>消费潜力</ThemedText>
                  <View style={[styles.badge, { backgroundColor: getColor(report.consumption_potential) }]}>
                    <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                      {report.consumption_potential === 'high' ? '高' : report.consumption_potential === 'medium' ? '中' : '低'}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.valueRow}>
                  <ThemedText variant="small" color={theme.textMuted}>生命周期</ThemedText>
                  <ThemedText variant="smallMedium" color={theme.textPrimary}>{getLifecycleLabel(report.lifecycle_stage)}</ThemedText>
                </View>
                <View style={styles.valueRow}>
                  <ThemedText variant="small" color={theme.textMuted}>预估LTV</ThemedText>
                  <ThemedText variant="smallMedium" color={theme.primary}>¥{report.ltv_estimate?.toLocaleString() || 0}/年</ThemedText>
                </View>
              </View>
            </View>

            {/* 近况与状态 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome5 name="heartbeat" size={20} color={theme.error} />
                <ThemedText variant="title" color={theme.textPrimary}>近况与状态</ThemedText>
              </View>
              <View style={styles.card}>
                {report.emotional_state && (
                  <View style={styles.statusRow}>
                    <ThemedText variant="small" color={theme.textMuted}>情绪状态</ThemedText>
                    <ThemedText variant="small" color={theme.textPrimary}>{report.emotional_state}</ThemedText>
                  </View>
                )}
                {report.skin_condition && (
                  <View style={styles.statusRow}>
                    <ThemedText variant="small" color={theme.textMuted}>皮肤状态</ThemedText>
                    <ThemedText variant="small" color={theme.textPrimary}>{report.skin_condition}</ThemedText>
                  </View>
                )}
                {report.life_events && (
                  <View style={styles.statusRow}>
                    <ThemedText variant="small" color={theme.textMuted}>生活动态</ThemedText>
                    <ThemedText variant="small" color={theme.textPrimary}>{report.life_events}</ThemedText>
                  </View>
                )}
                <View style={styles.statusRow}>
                  <ThemedText variant="small" color={theme.textMuted}>到店活跃度</ThemedText>
                  <View style={[styles.badge, { backgroundColor: getColor(report.visit_frequency) }]}>
                    <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                      {report.visit_frequency === 'high' ? '高频' : report.visit_frequency === 'low' ? '低频' : report.visit_frequency === 'dormant' ? '沉睡' : '正常'}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.statusRow}>
                  <ThemedText variant="small" color={theme.textMuted}>流失风险</ThemedText>
                  <View style={[styles.badge, { backgroundColor: getRiskColor(report.churn_risk) }]}>
                    <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                      {report.churn_risk === 'high' ? '高风险' : report.churn_risk === 'medium' ? '中风险' : '低风险'}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </View>

            {/* 核心需求洞察 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome5 name="bullseye" size={20} color={theme.accent} />
                <ThemedText variant="title" color={theme.textPrimary}>核心需求洞察</ThemedText>
              </View>
              <View style={styles.card}>
                <View style={styles.needsSection}>
                  <ThemedText variant="smallMedium" color={theme.textMuted}>最关注的问题</ThemedText>
                  <View style={styles.tagsRow}>
                    {parseJsonArray(report.top_needs).map((need, i) => (
                      <View key={i} style={styles.needTag}><ThemedText variant="tiny" color={theme.primary}>{need}</ThemedText></View>
                    ))}
                  </View>
                </View>
                {parseJsonArray(report.unmet_needs).length > 0 && (
                  <View style={styles.needsSection}>
                    <ThemedText variant="smallMedium" color={theme.textMuted}>未满足需求</ThemedText>
                    <View style={styles.tagsRow}>
                      {parseJsonArray(report.unmet_needs).map((need, i) => (
                        <View key={i} style={[styles.needTag, { backgroundColor: theme.backgroundTertiary }]}>
                          <ThemedText variant="tiny" color={theme.textSecondary}>{need}</ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {parseJsonArray(report.interests).length > 0 && (
                  <View style={styles.needsSection}>
                    <ThemedText variant="smallMedium" color={theme.textMuted}>兴趣偏好</ThemedText>
                    <View style={styles.tagsRow}>
                      {parseJsonArray(report.interests).map((interest, i) => (
                        <View key={i} style={[styles.needTag, { backgroundColor: theme.backgroundTertiary }]}>
                          <ThemedText variant="tiny" color={theme.textSecondary}>{interest}</ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* 跟进策略建议 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome5 name="lightbulb" size={20} color="#FFD700" />
                <ThemedText variant="title" color={theme.textPrimary}>跟进策略建议</ThemedText>
              </View>
              <View style={styles.card}>
                {report.best_timing && (
                  <View style={styles.statusRow}>
                    <FontAwesome6 name="clock" size={14} color={theme.textMuted} />
                    <ThemedText variant="small" color={theme.textPrimary}> {report.best_timing}</ThemedText>
                  </View>
                )}
                {report.best_channel && (
                  <View style={styles.statusRow}>
                    <FontAwesome6 name="comments" size={14} color={theme.textMuted} />
                    <ThemedText variant="small" color={theme.textPrimary}> {report.best_channel}</ThemedText>
                  </View>
                )}
                {report.suggested_staff && (
                  <View style={styles.statusRow}>
                    <FontAwesome6 name="user" size={14} color={theme.textMuted} />
                    <ThemedText variant="small" color={theme.textPrimary}> 建议沟通人：{report.suggested_staff}</ThemedText>
                  </View>
                )}
                {report.communication_style && (
                  <View style={styles.statusRow}>
                    <FontAwesome6 name="heart" size={14} color={theme.textMuted} />
                    <ThemedText variant="small" color={theme.textPrimary}> {report.communication_style}</ThemedText>
                  </View>
                )}
              </View>
            </View>

            {/* 推销建议 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome5 name="shopping-bag" size={20} color={theme.primary} />
                <ThemedText variant="title" color={theme.textPrimary}>推销建议</ThemedText>
              </View>
              <View style={styles.card}>
                {report.primary_recommendation && (
                  <View style={styles.recommendItem}>
                    <View style={styles.recommendBadge}><ThemedText variant="tiny" color={theme.buttonPrimaryText}>首选</ThemedText></View>
                    <ThemedText variant="small" color={theme.textPrimary}>{report.primary_recommendation}</ThemedText>
                  </View>
                )}
                {report.secondary_recommendation && (
                  <View style={styles.recommendItem}>
                    <View style={[styles.recommendBadge, { backgroundColor: theme.textMuted }]}>
                      <ThemedText variant="tiny" color={theme.buttonPrimaryText}>次选</ThemedText>
                    </View>
                    <ThemedText variant="small" color={theme.textPrimary}>{report.secondary_recommendation}</ThemedText>
                  </View>
                )}
                {report.pitch_angle && (
                  <View style={styles.pitchBox}>
                    <ThemedText variant="smallMedium" color={theme.textMuted}>话术切入点</ThemedText>
                    <ThemedText variant="small" color={theme.textPrimary}>{report.pitch_angle}</ThemedText>
                  </View>
                )}
                {parseJsonArray(report.avoid_items).length > 0 && (
                  <View style={styles.avoidSection}>
                    <ThemedText variant="smallMedium" color={theme.error}>避坑提醒</ThemedText>
                    {parseJsonArray(report.avoid_items).map((item, i) => (
                      <ThemedText key={i} variant="small" color={theme.textSecondary}>• {item}</ThemedText>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* 风险预警 */}
            {(report.churn_alert || report.complaint_alert) && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <FontAwesome5 name="exclamation-triangle" size={20} color={theme.error} />
                  <ThemedText variant="title" color={theme.textPrimary}>风险预警</ThemedText>
                </View>
                <View style={[styles.card, { borderLeftColor: theme.error, borderLeftWidth: 4 }]}>
                  {report.churn_alert && (
                    <View style={styles.alertRow}>
                      <FontAwesome6 name="user-slash" size={14} color={theme.error} />
                      <ThemedText variant="small" color={theme.textPrimary}> {report.churn_alert}</ThemedText>
                    </View>
                  )}
                  {report.complaint_alert && (
                    <View style={styles.alertRow}>
                      <FontAwesome6 name="exclamation-circle" size={14} color={theme.error} />
                      <ThemedText variant="small" color={theme.textPrimary}> {report.complaint_alert}</ThemedText>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* 价格敏感度 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome5 name="dollar-sign" size={20} color={theme.success} />
                <ThemedText variant="title" color={theme.textPrimary}>价格敏感度</ThemedText>
              </View>
              <View style={styles.card}>
                <View style={styles.valueRow}>
                  <ThemedText variant="small" color={theme.textMuted}>敏感程度</ThemedText>
                  <View style={[styles.badge, { backgroundColor: getColor(report.price_sensitivity) }]}>
                    <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                      {report.price_sensitivity === 'high' ? '高敏感' : report.price_sensitivity === 'medium' ? '中等' : '低敏感'}
                    </ThemedText>
                  </View>
                </View>
                {report.discount_strategy && (
                  <ThemedText variant="small" color={theme.textSecondary} style={{ marginTop: 8 }}>
                    {report.discount_strategy}
                  </ThemedText>
                )}
              </View>
            </View>
          </ScrollView>
        )}
      </ThemedView>
    </Screen>
  );
}
