import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

// 跨平台提示函数
const showAlert = (title: string, message: string, buttons?: { text: string; onPress?: () => void }[]) => {
  if (Platform.OS === 'web') {
    // Web 端使用原生 alert，成功时提供确认回调
    window.alert(`${title}\n${message}`);
    if (buttons && buttons.length > 0 && buttons[0].onPress) {
      buttons[0].onPress();
    }
  } else {
    Alert.alert(title, message, buttons);
  }
};

// 预设标签列表
const PRESET_TAGS = [
  '新客户',
  'VIP客户',
  '抗衰需求',
  '补水项目',
  '敏感肌',
  '背部疼痛',
  '失眠',
  '常客',
  '沉睡客户',
  '到期提醒',
];

export default function AddCustomerScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const { token } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // 切换标签选中状态
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
  };

  // 删除已选标签
  const removeTag = (tag: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert('提示', '请输入客户姓名');
      return;
    }

    if (!token) {
      showAlert('提示', '请先登录');
      router.replace('/login');
      return;
    }

    setLoading(true);
    try {
      // 组合备注内容：标签 + 用户输入的备注
      const tagString = selectedTags.map((t) => `#${t}`).join(' ');
      const fullNotes = tagString
        ? notes.trim()
          ? `${tagString} ${notes.trim()}`
          : tagString
        : notes.trim();

      /**
       * 服务端文件：server/src/routes/customer.routes.ts
       * 接口：POST /api/v1/customers
       * Body 参数：name: string, phone?: string, notes?: string
       * 需要认证：Bearer token
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          name: name.trim(), 
          phone: phone.trim(), 
          notes: fullNotes 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '保存失败');
      }

      showAlert('成功', '客户添加成功', [
        { text: '好的', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      showAlert('错误', error.message || '保存失败，请重试');
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
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <FontAwesome6 name="xmark" size={20} color={theme.textPrimary} />
            </TouchableOpacity>
            <ThemedText variant="h3" color={theme.textPrimary}>
              添加客户
            </ThemedText>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name Input */}
            <View style={styles.inputGroup}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>
                姓名 *
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="请输入客户姓名"
                placeholderTextColor={theme.textMuted}
                value={name}
                onChangeText={setName}
                maxLength={50}
              />
            </View>

            {/* Phone Input */}
            <View style={styles.inputGroup}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>
                电话
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="请输入联系电话"
                placeholderTextColor={theme.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={20}
              />
            </View>

            {/* Quick Tags Section */}
            <View style={styles.section}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>
                快速标签（点击添加/取消）
              </ThemedText>
              <View style={styles.quickTagsContainer}>
                {PRESET_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[
                        styles.quickTag,
                        isSelected && styles.quickTagSelected,
                      ]}
                      onPress={() => toggleTag(tag)}
                    >
                      <ThemedText
                        variant="small"
                        color={isSelected ? theme.buttonPrimaryText : theme.primary}
                      >
                        #{tag}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Selected Tags Display */}
            {selectedTags.length > 0 && (
              <View style={styles.section}>
                <ThemedText variant="labelTitle" color={theme.textMuted}>
                  已选标签（点击删除）
                </ThemedText>
                <View style={styles.selectedTagsContainer}>
                  {selectedTags.map((tag) => (
                    <TouchableOpacity
                      key={tag}
                      style={styles.selectedTag}
                      onPress={() => removeTag(tag)}
                    >
                      <ThemedText variant="small" color={theme.buttonPrimaryText}>
                        #{tag}
                      </ThemedText>
                      <FontAwesome6
                        name="xmark"
                        size={12}
                        color={theme.buttonPrimaryText}
                        style={{ marginLeft: 4 }}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Notes Input */}
            <View style={styles.inputGroup}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>
                备注
              </ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="记录客户特点、偏好等信息..."
                placeholderTextColor={theme.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
            </View>
          </ScrollView>

          {/* Bottom Button */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>
                {loading ? '保存中...' : '保存'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
