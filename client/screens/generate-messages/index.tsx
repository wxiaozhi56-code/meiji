import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

interface GeneratedMessage {
  id: number;
  type: string;
  content: string;
}

export default function GenerateMessagesScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ customerId: number }>();

  const [generating, setGenerating] = useState(false);
  const [customContext, setCustomContext] = useState('');
  const [messages, setMessages] = useState<GeneratedMessage[]>([
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
    {
      id: 3,
      type: '互动型',
      content:
        '姐，最近店里来了新的补水项目，特别适合压力大、睡眠不好的姐妹。您有空来体验一下？',
    },
  ]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // 调用 API 使用 LLM 生成话术
      // 演示时模拟延迟
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Add a new message
      const newMessage: GeneratedMessage = {
        id: Date.now(),
        type: '智能生成',
        content: customContext
          ? `根据您的需求：${customContext}，建议这样跟进...`
          : 'AI正在根据客户画像生成个性化话术...',
      };
      setMessages([...messages, newMessage]);
    } catch (error) {
      console.error('生成失败:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyMessage = (content: string) => {
    // 复制到剪贴板
    console.log('Copy:', content);
  };

  const handleUseMessage = (message: GeneratedMessage) => {
    // 导航到发送消息或复制到剪贴板
    router.back();
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
                      使用此话术
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* Tips */}
          <View style={styles.tipsContainer}>
            <FontAwesome5 name="info-circle" size={16} color={theme.textMuted} />
            <ThemedText variant="caption" color={theme.textMuted}>
              AI会根据客户标签、历史记录和您提供的上下文自动生成个性化话术
            </ThemedText>
          </View>
        </ScrollView>
      </ThemedView>
    </Screen>
  );
}
