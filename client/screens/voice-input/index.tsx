import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import { FontAwesome6 } from '@expo/vector-icons';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

export default function VoiceInputScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();

  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processing, setProcessing] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 请求录音权限
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // 脉冲动画
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // 计时器
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 59) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    if (!hasPermission) {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要权限', '请授予录音权限');
        return;
      }
      setHasPermission(true);
    }

    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (error) {
      console.error('录音失败:', error);
      Alert.alert('录音失败', '无法开始录音，请重试');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      if (uri) {
        await handleRecordingComplete(uri);
      }
    } catch (error) {
      console.error('停止录音失败:', error);
      Alert.alert('录音失败', '无法停止录音，请重试');
    }
  };

  const handleRecordingComplete = async (uri: string) => {
    setProcessing(true);
    try {
      // 上传音频文件到服务器进行语音识别和标签提取
      // 模拟处理过程
      await new Promise((resolve) => setTimeout(resolve, 2000));

      Alert.alert(
        '录音完成',
        '语音已成功转文字并提取标签',
        [
          {
            text: '查看结果',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('处理失败:', error);
      Alert.alert('处理失败', '无法处理录音，请重试');
    } finally {
      setProcessing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
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
            语音录入
          </ThemedText>
          <View style={styles.placeholder} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.instructionContainer}>
            <ThemedText variant="body" color={theme.textSecondary}>
              {isRecording
                ? '正在录音...'
                : '点击麦克风按钮开始录音'}
            </ThemedText>
            <ThemedText variant="small" color={theme.textMuted}>
              最长录制1分钟，结束后自动处理
            </ThemedText>
          </View>

          {/* Recording Timer */}
          {(isRecording || processing) && (
            <View style={styles.timerContainer}>
              <ThemedText variant="h1" color={theme.primary}>
                {formatTime(recordingTime)}
              </ThemedText>
              {processing && (
                <ThemedText variant="small" color={theme.textMuted}>
                  处理中...
                </ThemedText>
              )}
            </View>
          )}

          {/* Recording Button */}
          <Animated.View
            style={[
              styles.recordButtonContainer,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.recordButton,
                isRecording && styles.recordButtonActive,
                processing && styles.recordButtonDisabled,
              ]}
              onPress={isRecording ? stopRecording : startRecording}
              disabled={processing}
              activeOpacity={0.8}
            >
              <FontAwesome6
                name={isRecording ? 'stop' : 'microphone'}
                size={48}
                color={isRecording ? theme.error : theme.buttonPrimaryText}
              />
            </TouchableOpacity>
          </Animated.View>

          {/* Tips */}
          <View style={styles.tipsContainer}>
            <ThemedText variant="caption" color={theme.textMuted}>
              提示：清晰说出客户信息和关注点
            </ThemedText>
            <ThemedText variant="caption" color={theme.textMuted}>
              例如：张姐今天来做背，聊到她女儿中考结束
            </ThemedText>
          </View>
        </View>
      </ThemedView>
    </Screen>
  );
}
