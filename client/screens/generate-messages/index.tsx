import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface GeneratedMessage {
  id: number;
  type: string;
  content: string;
}

interface FollowUpRecord {
  id: number;
  content: string;
  created_at: string;
}

export default function GenerateMessagesScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ customerId: number; followUpRecordId: number }>();
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [generating, setGenerating] = useState(false);
  const [customContext, setCustomContext] = useState('');
  const [messages, setMessages] = useState<GeneratedMessage[]>([]);
  const [followUpRecord, setFollowUpRecord] = useState<FollowUpRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // 认证检查
  useFocusEffect(
    useCallback(() => {
      if (authLoading) return;
      
      if (!isAuthenticated) {
        router.replace('/login');
      }
    }, [authLoading, isAuthenticated, router])
  );

  // 获取跟进记录详情
  React.useEffect(() => {
    fetchFollowUpRecord();
  }, [params.followUpRecordId]);

  const fetchFollowUpRecord = async () => {
    if (!params.followUpRecordId || !token) {
      setLoading(false);
      return;
    }

    try {
      // 先从客户详情获取跟进记录
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/follow-up-records/${params.followUpRecordId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setFollowUpRecord(data);
      }
    } catch (error) {
      console.error('Failed to fetch follow-up record:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!params.customerId) {
      Toast.show({
        type: 'error',
        text1: '缺少客户信息',
      });
      return;
    }

    if (!token) {
      Toast.show({
        type: 'error',
        text1: '请先登录',
      });
      router.replace('/login');
      return;
    }

    setGenerating(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/ai/messages
       * Body 参数：customerId: number, followUpRecordId?: number, customContext?: string
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/ai/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: params.customerId,
          followUpRecordId: params.followUpRecordId || null,
          customContext: customContext || null,
        }),
      });

      if (!response.ok) {
        throw new Error('生成失败');
      }

      const data = await response.json();
      setMessages(data);

      Toast.show({
        type: 'success',
        text1: '话术生成成功',
        text2: `已生成 ${data.length} 条话术`,
      });
    } catch (error: any) {
      console.error('生成失败:', error);
      Toast.show({
        type: 'error',
        text1: '生成失败',
        text2: error.message || '请重试',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyMessage = async (content: string) => {
    await Clipboard.setStringAsync(content);
    Toast.show({
      type: 'success',
      text1: '已复制',
      text2: '话术已复制到剪贴板',
    });
  };

  const handleUseMessage = (message: GeneratedMessage) => {
    handleCopyMessage(message.content);
    setTimeout(() => {
      router.back();
    }, 500);
  };

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
          <ThemedText variant="h3" color={theme.textPrimary}>
            生成话术
          </ThemedText>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 显示关联的跟进记录 */}
          {followUpRecord && (
            <View style={styles.recordCard}>
              <View style={styles.recordHeader}>
                <FontAwesome6 name="quote-left" size={14} color={theme.accent} />
                <ThemedText variant="caption" color={theme.textMuted}>
                  基于跟进记录生成
                </ThemedText>
              </View>
              <ThemedText variant="body" color={theme.textPrimary}>
                {followUpRecord.content}
              </ThemedText>
            </View>
          )}

          {/* Context Input */}
          <View style={styles.section}>
            <ThemedText variant="labelTitle" color={theme.textMuted}>
              自定义上下文（可选）
            </ThemedText>
            <TextInput
              style={styles.contextInput}
              placeholder="例如：想推荐补水项目、问候女儿中考情况..."
              placeholderTextColor={theme.textMuted}
              value={customContext}
              onChangeText={setCustomContext}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Generate Button */}
          <TouchableOpacity
            style={[styles.generateButton, generating && styles.generateButtonDisabled]}
            onPress={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color={theme.buttonPrimaryText} />
            ) : (
              <>
                <FontAwesome6 name="wand-magic-sparkles" size={20} color={theme.buttonPrimaryText} />
                <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>
                  生成话术
                </ThemedText>
              </>
            )}
          </TouchableOpacity>

          {/* Generated Messages */}
          {messages.length > 0 && (
            <View style={styles.section}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>
                话术列表
              </ThemedText>
              {messages.map((message) => (
                <View key={message.id} style={styles.messageCard}>
                  <View style={styles.messageHeader}>
                    <View style={styles.messageType}>
                      <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                        {message.type}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleCopyMessage(message.content)}
                      style={styles.iconButton}
                    >
                      <FontAwesome6 name="copy" size={16} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <ThemedText variant="body" color={theme.textPrimary}>
                    {message.content}
                  </ThemedText>
                  <View style={styles.messageActions}>
                    <TouchableOpacity
                      style={styles.useButton}
                      onPress={() => handleUseMessage(message)}
                    >
                      <ThemedText variant="smallMedium" color={theme.buttonPrimaryText}>
                        复制并返回
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Tips */}
          <View style={styles.tipsContainer}>
            <FontAwesome5 name="info-circle" size={16} color={theme.textMuted} />
            <ThemedText variant="caption" color={theme.textMuted}>
              AI会根据客户标签、跟进记录和您提供的上下文自动生成个性化话术
            </ThemedText>
          </View>
        </ScrollView>
      </ThemedView>
    </Screen>
  );
}
