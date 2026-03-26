import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

interface CustomerDetail {
  id: number;
  name: string;
  phone?: string;
  avatar?: string;
  tags: Array<{ name: string; category: string }>;
  aiBrief: {
    summary: string;
    suggestions: Array<{
      type: string;
      content: string;
    }>;
  };
  generatedMessages: Array<{
    id: number;
    type: string;
    content: string;
  }>;
  followUpHistory: Array<{
    id: number;
    date: string;
    content: string;
  }>;
}

// Mock data for demo
const MOCK_CUSTOMER_DETAIL: CustomerDetail = {
  id: 1,
  name: '张女士',
  phone: '138****1234',
  tags: [
    { name: '#女儿中考', category: '家庭动态' },
    { name: '#失眠', category: '健康状况' },
    { name: '#皮肤干燥', category: '皮肤状况' },
    { name: '#法令纹关注', category: '抗衰需求' },
  ],
  aiBrief: {
    summary: '张姐最近3周到店频率降低，处于高压失眠状态，皮肤屏障脆弱。连续两次提及在意法令纹。',
    suggestions: [
      {
        type: '关怀点',
        content: '女儿刚中考完，可问候放松情况',
      },
      {
        type: '推荐项目',
        content: '建议下次主推"非刺激性的深层补水+射频抗衰"，针对法令纹做体验式营销',
      },
      {
        type: '避坑提醒',
        content: '暂时避免推荐高酸类项目',
      },
    ],
  },
  generatedMessages: [
    {
      id: 1,
      type: '关怀型',
      content:
        '姐，最近天气热，您又为闺女升学操心，皮肤容易敏感。给您发个睡前放松小技巧，您空了看看~',
    },
    {
      id: 2,
      type: '价值型',
      content:
        '姐，上次您提的法令纹，我请教了老师，有个简单的手部按摩操对改善"熬夜纹"挺有效，我发您小视频呀？',
    },
  ],
  followUpHistory: [
    {
      id: 1,
      date: '2024-01-15',
      content: '客户来做背部护理，提到女儿中考结束，最近压力大失眠，觉得皮肤干',
    },
    {
      id: 2,
      date: '2024-01-08',
      content: '客户咨询抗衰项目，特别关注法令纹问题',
    },
  ],
};

export default function CustomerDetailScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ id: number }>();
  const [customer] = useState<CustomerDetail>(MOCK_CUSTOMER_DETAIL);
  const [selectedMessage, setSelectedMessage] = useState<number | null>(null);

  const handleGenerateMessages = () => {
    // 调用 API 生成新话术
    router.push('/generate-messages', { customerId: customer.id });
  };

  const handleCopyMessage = (content: string) => {
    // 复制消息到剪贴板
    console.log('Copy message:', content);
  };

  const handleStartRecord = () => {
    router.push('/voice-input');
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
            客户详情
          </ThemedText>
          <TouchableOpacity onPress={handleStartRecord} style={styles.recordButton}>
            <FontAwesome6 name="microphone" size={20} color={theme.buttonPrimaryText} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Customer Info Card */}
          <View style={styles.customerCard}>
            <View style={styles.customerHeader}>
              <View style={styles.avatarContainer}>
                {customer.avatar ? (
                  <Image source={{ uri: customer.avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <ThemedText variant="h3" color={theme.primary}>
                      {customer.name.charAt(0)}
                    </ThemedText>
                  </View>
                )}
              </View>
              <View style={styles.customerInfo}>
                <ThemedText variant="h2" color={theme.textPrimary}>
                  {customer.name}
                </ThemedText>
                <ThemedText variant="small" color={theme.textMuted}>
                  {customer.phone}
                </ThemedText>
              </View>
            </View>

            <View style={styles.tagsContainer}>
              {customer.tags.map((tag, index) => (
                <View key={index} style={styles.tagCategory}>
                  <ThemedText variant="tiny" color={theme.textMuted}>
                    {tag.category}
                  </ThemedText>
                  <View style={styles.tag}>
                    <ThemedText variant="tiny" color={theme.primary}>
                      {tag.name}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* AI Brief Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="brain" size={20} color={theme.accent} />
              <ThemedText variant="title" color={theme.textPrimary}>
                AI客户简报
              </ThemedText>
            </View>
            <View style={styles.briefCard}>
              <ThemedText variant="body" color={theme.textPrimary}>
                {customer.aiBrief.summary}
              </ThemedText>
            </View>
          </View>

          {/* Suggestions Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="lightbulb" size={20} color={theme.accent} />
              <ThemedText variant="title" color={theme.textPrimary}>
                跟进建议
              </ThemedText>
            </View>
            {customer.aiBrief.suggestions.map((suggestion, index) => (
              <View key={index} style={styles.suggestionCard}>
                <View style={styles.suggestionType}>
                  <ThemedText variant="captionMedium" color={theme.buttonPrimaryText}>
                    {suggestion.type}
                  </ThemedText>
                </View>
                <ThemedText variant="small" color={theme.textSecondary}>
                  {suggestion.content}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Generated Messages Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="comment-dots" size={20} color={theme.accent} />
              <ThemedText variant="title" color={theme.textPrimary}>
                智能话术
              </ThemedText>
            </View>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={handleGenerateMessages}
            >
              <FontAwesome6 name="wand-magic-sparkles" size={16} color={theme.buttonPrimaryText} />
              <ThemedText variant="smallMedium" color={theme.buttonPrimaryText}>
                生成新话术
              </ThemedText>
            </TouchableOpacity>
            {customer.generatedMessages.map((message) => (
              <TouchableOpacity
                key={message.id}
                style={[
                  styles.messageCard,
                  selectedMessage === message.id && styles.messageCardSelected,
                ]}
                onPress={() => setSelectedMessage(message.id)}
              >
                <View style={styles.messageHeader}>
                  <View style={styles.messageType}>
                    <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                      {message.type}
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleCopyMessage(message.content)}
                    style={styles.copyButton}
                  >
                    <FontAwesome6 name="copy" size={14} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
                <ThemedText variant="small" color={theme.textPrimary}>
                  {message.content}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Follow-up History Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome5 name="history" size={20} color={theme.accent} />
              <ThemedText variant="title" color={theme.textPrimary}>
                跟进记录
              </ThemedText>
            </View>
            {customer.followUpHistory.map((record) => (
              <View key={record.id} style={styles.historyCard}>
                <ThemedText variant="caption" color={theme.textMuted}>
                  {record.date}
                </ThemedText>
                <ThemedText variant="small" color={theme.textSecondary}>
                  {record.content}
                </ThemedText>
              </View>
            ))}
          </View>
        </ScrollView>
      </ThemedView>
    </Screen>
  );
}
