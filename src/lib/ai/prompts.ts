import { CHOICE_MARKS } from "../quality";
import { DIFFICULTY_LABEL } from "../labels";
import { DEPT_GAP, DEPT_MIN_LEARNERS, pct, type TestStats } from "../analytics";
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
- ある問題の選択肢に使った文を、別の問題の選択肢や正解に使わない（片方の問題が、もう片方の答えを教えてしまうため）。
- 「A・B・Cの（　）つ」のように、問題文を数えれば答えが分かる問題を作らない。資料の前置き（「この資料では…」）は問題にしない。
- 正解だけが長い・短いと答えが分かってしまうので、4つの選択肢の長さをそろえる。
- 文章は日本語で、新入社員にも分かるやさしい言葉にする。`;

export function buildQuizPrompt(input: { title: string; body: string; count: number; difficulty: Difficulty; variant?: number }): string {
  const again = input.variant ? `\n作り直し: ${input.variant}回目。前に作った問題とは、資料の別の箇所・別の聞き方で作る。` : "";
  return `作る問題の数: ${input.count}問
難しさ: ${DIFFICULTY_LABEL[input.difficulty]}（difficulty には "${input.difficulty}" を入れる）${again}

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
- 全体の正答率が高くても、特定の部署だけ正答率が大きく低い問題があれば取り上げる（「部署×問題」を見る）。人数が少ない部署は偶然の可能性も書く。
- 受講者個人を責める書き方ではなく、研修の改善につながる書き方にする。`;

export function buildFollowUpPrompt(test: Test, stats: TestStats, people: Person[]): string {
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
  const matrix = stats.departmentQuestions
    .map((d) => `- ${d.department}: ${d.questions.map((q) => `第${q.index + 1}問 ${q.answered ? pct(q.correctRate) : "-"}`).join(" / ")}`)
    .join("\n");
  const gapLines = stats.departmentGaps
    .map((g) => `- ${g.department} [${g.questionId}] 第${g.index + 1}問: 部署${pct(g.deptRate)}（${g.answered}人）/ 全体${pct(g.overallRate)}`)
    .join("\n");

  return `テスト: ${test.title}（資料「${test.material.title}」）
受講済み: ${stats.learnerCount}人 / 対象${stats.targetCount}人（未受講: ${stats.notTaken.map(name).join("、") || "なし"}）
平均点: ${Math.round(stats.avgScore)}点 / 満点: ${stats.perfectCount}人

問題ごとの結果（[id] 番号 正答率）:
${qLines}

部署別:
${deptLines || "- なし"}

部署×問題の正答率（各部署の最新の結果）:
${matrix || "- なし"}

全体より大きく低い部署×問題（部署の正答率が全体より${Math.round(DEPT_GAP * 100)}ポイント以上低い・${DEPT_MIN_LEARNERS}人以上）:
${gapLines || "- なし"}`;
}
