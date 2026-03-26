import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { FontAwesome6 } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

export default function VoiceInputScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ customerId: number }>();

  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processing, setProcessing] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 请求录音权限
  useEffect(() => {
    requestPermission();
  }, []);

  const requestPermission = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: '需要麦克风权限',
          text2: '请在浏览器或系统设置中允许访问麦克风',
        });
      }
    } catch (error) {
      console.error('权限请求失败:', error);
      setHasPermission(false);
    }
  };

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
    if (hasPermission === false) {
      await requestPermission();
      return;
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
      
      Toast.show({
        type: 'success',
        text1: '开始录音',
        text2: '请开始说话...',
      });
    } catch (error: any) {
      console.error('录音失败:', error);
      Toast.show({
        type: 'error',
        text1: '录音失败',
        text2: error.message || '无法开始录音，请检查麦克风权限',
      });
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
        Toast.show({
          type: 'success',
          text1: '录音完成',
          text2: '正在处理...',
        });
        await handleRecordingComplete(uri);
      }
    } catch (error: any) {
      console.error('停止录音失败:', error);
      Toast.show({
        type: 'error',
        text1: '停止失败',
        text2: error.message || '请重试',
      });
    }
  };

  const handleRecordingComplete = async (uri: string) => {
    setProcessing(true);
    try {
      // 1. 读取音频文件
      const audioBase64 = await (FileSystem as any).readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // 2. 上传音频到对象存储
      const fileName = `voice/${Date.now()}.m4a`;
      const uploadResponse = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/upload/audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName,
          fileContent: audioBase64,
          contentType: 'audio/mp4',
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error('音频上传失败');
      }

      const { audioUrl } = await uploadResponse.json();

      // 3. 调用语音处理API
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/voice/process
       * Body 参数：audioUrl: string, customerId: number
       */
      const processResponse = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/voice/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioUrl,
          customerId: params.customerId,
        }),
      });

      if (!processResponse.ok) {
        throw new Error('语音处理失败');
      }

      const result = await processResponse.json();
      console.log('Voice process result:', result);

      Toast.show({
        type: 'success',
        text1: '处理完成',
        text2: '语音已转文字并提取标签',
      });

      // 返回上一页并刷新数据
      setTimeout(() => {
        router.back();
      }, 1000);
    } catch (error: any) {
      console.error('处理失败:', error);
      Toast.show({
        type: 'error',
        text1: '处理失败',
        text2: error.message || '请重试',
      });
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
              {hasPermission === false
                ? '请授予麦克风权限'
                : isRecording
                  ? '正在录音，点击停止...'
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
