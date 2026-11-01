import type { Metadata } from 'next';
import LearningPreview from '@/components/learning/LearningPreview';

export const metadata: Metadata = {
  title: '日和學習｜詞彙與文法整合預覽',
  description: '免登入的日語學習功能預覽：詞彙、文法、FSRS 間隔複習、測驗及舊資料匯入。正式教材仍在建置。',
  robots: { index: false, follow: false },
};

export default function PreviewPage() {
  return <LearningPreview />;
}
