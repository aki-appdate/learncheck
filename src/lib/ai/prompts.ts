import { CHOICE_MARKS } from "../quality";
import { DIFFICULTY_LABEL } from "../labels";
import type { TestStats } from "../analytics";
import type { Difficulty, Person, Test } from "../types";

// AIへの指示文。何を渡し、何を返してほしいかをここに集める。

export const QUIZ_SYSTEM = `あなたは企業の研修担当を手伝うアシスタントです。
渡された研修資料だけを使って、受講者の理解度を確かめる4択の確認テストを作ります。

守ること:
- 資料に書かれていないことを問題・選択肢・解説にしない。一般常識や他社の例で補わない。
- quote には、正解の根拠となる資料の文を一字一句そのまま書き写す（1文、長くても2文）。要約・言い換え・語尾の変更をしない。
- 正解は1つだけ。ほかの3つは、資料を読んでいない人が選びそうな、もっともらしい誤答にする。
- 「すべて正しい」「どれでもない」のような選択肢は使わない。同じ内容の選択肢を作らない。
- 正解の位置（answerIndex）が偏らないようにする。
- 資料の同じ箇所から何問も作らず、資料全体からまんべんなく出す。
- 文章は日本語で、新入社員にも分かるやさしい言葉にする。`;

export function buildQuizPrompt(input: { title: string; body: string; count: number; difficulty: Difficulty }): string {
  return `作る問題の数: ${input.count}問
難しさ: ${DIFFICULTY_LABEL[input.difficulty]}（difficulty には "${input.difficulty}" を入れる）

研修資料「${input.title}」:
<<<資料ここから
${input.body}
資料ここまで>>>`;
}

export const FOLLOWUP_SYSTEM = `あなたは企業の研修担当を補佐するアナリストです。
確認テストの集計結果から、どこが伝わっていないかを読み取り、フォロー研修の提案を最大3つ出します。

守ること:
- 根拠にした問題の id を evidenceQuestionIds に必ず入れる。渡された id 以外は使わない。
- 数字は渡された集計値だけを使い、計算し直したり作ったりしない。
- 正答率が低い原因は「教え方」だけでなく「問題文や選択肢が紛らわしい」可能性もあることを考える。
- 受講者個人を責める書き方ではなく、研修の改善につながる書き方にする。`;

export function buildFollowUpPrompt(test: Test, stats: TestStats, people: Person[]): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const qLines = stats.questions
    .map((s) => {
      const q = test.questions[s.index];
      const choices = q.choices.map((c, i) => `${CHOICE_MARKS[i]}${i === q.answerIndex ? "（正解）" : ""}:${c}（${s.choiceCounts[i]}人）`).join(" / ");
      return `[${q.id}] 第${s.index + 1}問 正答率${pct(s.correctRate)}（${s.answered}人）
  問題: ${q.prompt.replace(/\n/g, " ")}
  選択肢: ${choices}
  根拠の文: ${q.quote}`;
    })
    .join("\n");
  const deptLines = stats.departments
    .map((d) => {
      const wq = d.weakest && test.questions.findIndex((q) => q.id === d.weakest!.questionId);
      return `- ${d.department}: ${d.learners}人 / 平均${Math.round(d.avgScore)}点${d.weakest ? ` / 一番低い問題 [${d.weakest.questionId}] 第${(wq ?? 0) + 1}問 ${pct(d.weakest.correctRate)}` : ""}`;
    })
    .join("\n");
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;

  return `テスト: ${test.title}（資料「${test.material.title}」）
受講済み: ${stats.learnerCount}人 / 対象${stats.targetCount}人（未受講: ${stats.notTaken.map(name).join("、") || "なし"}）
平均点: ${Math.round(stats.avgScore)}点 / 満点: ${stats.perfectCount}人

問題ごとの結果（[id] 番号 正答率）:
${qLines}

部署別:
${deptLines || "- なし"}`;
}
