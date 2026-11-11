// デモ用のデータ。人名・部署・資料はすべて架空。
// 乱数の種を固定しているので、誰が開いても同じ傾向のデータになる（日付だけは「お試しを始めた日」基準でずらす）。
// 受講日は平日、時刻は 9:00〜18:00 の決まった時刻にする（開いた時刻によって受講時刻が変わらないように）。
//
// 結果ダッシュボードが面白くなるよう、次の傾向を仕込んである。
// ・個人情報テストの第8問（漏えいに気づいたら最初にすること）で「原因を調べてから報告」を選ぶ人が多い
// ・個人情報テストの第10問（取引先からの問い合わせ）は、カスタマーサポートで誤答が多い
// ・セキュリティテストの第1問（パスワードの長さ）で「8文字以上」を選ぶ人が多い
// ・セキュリティテストの第5問（あやしい添付を開いてしまったら）は、営業2課で「電源を切る」が多い
// ・何人かは同じテストを2回受けている（集計には最新の結果を使う）

import { MATERIALS } from "./materials";
import { mulberry32, shuffle } from "./random";
import type { Attempt, Difficulty, Material, Person, Test, TestQuestion } from "./types";

export const PEOPLE: Person[] = [
  { id: "trainer-1", name: "森下 千尋", role: "trainer", department: null },
  { id: "l-01", name: "青木 陽菜", role: "learner", department: "営業1課" },
  { id: "l-02", name: "石井 拓真", role: "learner", department: "営業1課" },
  { id: "l-03", name: "上田 さくら", role: "learner", department: "営業1課" },
  { id: "l-04", name: "遠藤 悠斗", role: "learner", department: "営業1課" },
  { id: "l-05", name: "大野 結衣", role: "learner", department: "営業2課" },
  { id: "l-06", name: "岡田 蓮", role: "learner", department: "営業2課" },
  { id: "l-07", name: "川口 美月", role: "learner", department: "営業2課" },
  { id: "l-08", name: "北村 湊", role: "learner", department: "営業2課" },
  { id: "l-09", name: "久保 葵", role: "learner", department: "カスタマーサポート" },
  { id: "l-10", name: "小松 颯太", role: "learner", department: "カスタマーサポート" },
  { id: "l-11", name: "斉藤 真央", role: "learner", department: "カスタマーサポート" },
  { id: "l-12", name: "坂本 陸", role: "learner", department: "総務" },
  { id: "l-13", name: "杉山 莉子", role: "learner", department: "総務" },
  { id: "l-14", name: "関 大和", role: "learner", department: "総務" },
];

type QDef = {
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
  quote: string;
  difficulty: Difficulty;
  /** 受講者が正解する基本の確率 */
  p: number;
  /** 間違えるときに選ばれやすい誤答（位置）と、その重み */
  trap?: { choice: number; weight: number };
  /** 部署ごとの正解率の上げ下げ */
  dept?: Record<string, number>;
};

const PRIVACY_QS: QDef[] = [
  {
    prompt: "名刺の扱いとして、資料の内容に合っているものはどれですか。",
    choices: [
      "会社の情報なので、個人情報にはあたらない",
      "氏名・会社名・電話番号が載っているため、個人情報として扱う",
      "顔写真が載っていなければ、個人情報にはあたらない",
      "受け取った時点で会社のものになるので、自由に使ってよい",
    ],
    answer: 1,
    explanation: "名刺には氏名・会社名・電話番号が載っているため、1枚でも個人情報として扱います。",
    quote: "名刺1枚にも、氏名・会社名・電話番号が載っているため、名刺は個人情報として扱います。",
    difficulty: "easy",
    p: 0.92,
  },
  {
    prompt: "見積書を送るためにお客様から聞いたメールアドレスの使い方として、正しいものはどれですか。",
    choices: [
      "同じお客様なので、新商品の案内メールにも使ってよい",
      "社内の全員に共有しておく",
      "本人の同意なく、新商品の案内メールに使ってはいけない",
      "1年たったら自由に使ってよい",
    ],
    answer: 2,
    explanation: "個人情報は、お客様に伝えた利用目的の範囲でだけ使います。別の目的に使うには本人の同意が必要です。",
    quote: "見積書を送るために聞いたメールアドレスを、本人の同意なく新商品の案内メールに使ってはいけません。",
    difficulty: "normal",
    p: 0.82,
    trap: { choice: 0, weight: 3 },
  },
  {
    prompt: "個人情報を含むデータの保存先として、正しいものはどれですか。",
    choices: ["自分のパソコンのデスクトップ", "USBメモリ", "会社が用意した共有フォルダ", "個人で契約しているクラウドサービス"],
    answer: 2,
    explanation: "データは会社が用意した共有フォルダにだけ保存します。デスクトップやUSBメモリには保存しません。",
    quote: "データは会社が用意した共有フォルダにだけ保存し、個人のパソコンのデスクトップやUSBメモリには保存しません。",
    difficulty: "easy",
    p: 0.9,
  },
  {
    prompt: "個人情報を含むファイルを社外に送るときの正しい方法はどれですか。",
    choices: [
      "パスワードを付け、パスワードは同じメールの本文に書く",
      "パスワードを付け、パスワードは別の手段で伝える",
      "宛先が取引先なら、パスワードは付けなくてよい",
      "個人情報を含むファイルは、どんな場合でも社外に送れない",
    ],
    answer: 1,
    explanation: "パスワードを同じメールに書くと、誤送信したときに意味がありません。パスワードは電話など別の手段で伝えます。",
    quote: "個人情報を含むファイルを社外に送るときは、パスワードを付けたうえで、パスワードは別の手段で伝えます。",
    difficulty: "normal",
    p: 0.76,
    trap: { choice: 0, weight: 4 },
  },
  {
    prompt: "個人情報を含む書類やパソコンを社外に持ち出すときに必要なことはどれですか。",
    choices: [
      "持ち出したあとで、上長に口頭で伝える",
      "事前に上長の許可を受け、持ち出し記録簿に記入する",
      "自分の判断で持ち出してよい",
      "情報管理窓口にメールで連絡するだけでよい",
    ],
    answer: 1,
    explanation: "持ち出しは事前の許可制です。あとから報告するのでは足りません。",
    quote: "個人情報を含む書類やパソコンを社外に持ち出すときは、事前に上長の許可を受け、持ち出し記録簿に記入します。",
    difficulty: "normal",
    p: 0.8,
    trap: { choice: 0, weight: 3 },
  },
  {
    prompt: "個人情報を含む書類を持って電車で移動するとき、してはいけないことはどれですか。",
    choices: ["かばんを体から離さずに持つ", "かばんを電車の網棚に置く", "書類をかばんの中にしまっておく", "まっすぐ会社に戻る"],
    answer: 1,
    explanation: "網棚に置くと、置き忘れや盗難につながります。資料では禁止されています。",
    quote: "電車の網棚にかばんを置くことは禁止です。",
    difficulty: "easy",
    p: 0.94,
  },
  {
    prompt: "個人情報を含む紙を捨てるときの正しい方法はどれですか。",
    choices: [
      "細かく手で破ってから、ごみ箱に捨てる",
      "裏紙としてメモに使ってから捨てる",
      "シュレッダーにかけるか、溶解処理用の回収箱に入れる",
      "まとめて自宅に持ち帰って捨てる",
    ],
    answer: 2,
    explanation: "手で破っただけでは読み取れてしまいます。必ずシュレッダーか溶解処理用の回収箱を使います。",
    quote: "個人情報を含む紙は、ごみ箱に捨てず、必ずシュレッダーにかけるか、溶解処理用の回収箱に入れます。",
    difficulty: "easy",
    p: 0.86,
    trap: { choice: 0, weight: 2 },
  },
  {
    prompt: "メールの誤送信に気づきました。最初にすることとして正しいものはどれですか。",
    choices: [
      "何が起きたのかを自分で調べ、原因が分かってから上長に報告する",
      "まず上長と情報管理窓口に報告する",
      "先に送信相手に電話して、メールを消してもらうようお願いする",
      "相手から連絡がなければ、報告しなくてよい",
    ],
    answer: 1,
    explanation: "原因を調べたり相手に連絡したりする前に、まず報告します。早く報告するほど被害を小さくできます。",
    quote: "自分で原因を調べたり、相手に連絡したりする前に、まず上長と情報管理窓口に報告してください。",
    difficulty: "hard",
    p: 0.42,
    trap: { choice: 0, weight: 6 },
  },
  {
    prompt: "漏えいに気づいてから報告するまでの目安として、資料に書かれている時間はどれですか。",
    choices: ["30分以内", "その日の終業まで", "24時間以内", "3営業日以内"],
    answer: 0,
    explanation: "気づいてから30分以内が目安です。小さなことでも、すぐに報告します。",
    quote: "報告は、気づいてから30分以内が目安です。",
    difficulty: "normal",
    p: 0.72,
    trap: { choice: 1, weight: 4 },
    dept: { "営業2課": -0.25 },
  },
  {
    prompt: "取引先の方から「別の担当者の連絡先を教えてほしい」と頼まれました。正しい対応はどれですか。",
    choices: [
      "取引先からの依頼なので、教えてよい",
      "メールアドレスだけなら教えてよい",
      "本人の同意がない限り教えず、担当者から折り返し連絡すると伝える",
      "上長が不在なら、自分の判断で教えてよい",
    ],
    answer: 2,
    explanation: "相手が取引先でも、本人の同意なく連絡先を教えてはいけません。「担当者から折り返しご連絡します」と伝えます。",
    quote: "本人の同意がない限り、たとえ取引先の方からの依頼でも教えてはいけません。",
    difficulty: "normal",
    p: 0.8,
    trap: { choice: 0, weight: 4 },
    dept: { "カスタマーサポート": -0.6 },
  },
];

const SECURITY_QS: QDef[] = [
  {
    prompt: "パスワードの長さについて、資料の決まりに合っているものはどれですか。",
    choices: ["8文字以上", "10文字以上", "12文字以上", "16文字以上"],
    answer: 2,
    explanation: "12文字以上にし、英字の大文字・小文字・数字・記号のうち3種類以上を組み合わせます。",
    quote: "パスワードは12文字以上にし、英字の大文字・小文字・数字・記号のうち3種類以上を組み合わせます。",
    difficulty: "normal",
    p: 0.48,
    trap: { choice: 0, weight: 6 },
  },
  {
    prompt: "パスワードの使い回しについて、正しいものはどれですか。",
    choices: [
      "覚えやすいので、すべてのサービスで同じパスワードにする",
      "同じパスワードを複数のサービスで使い回すことは禁止",
      "社内のサービスどうしなら使い回してよい",
      "半年ごとに変えれば使い回してよい",
    ],
    answer: 1,
    explanation: "1つのサービスからパスワードが漏れると、ほかのサービスにも入られてしまうため禁止です。",
    quote: "同じパスワードを複数のサービスで使い回すことは禁止です。",
    difficulty: "easy",
    p: 0.9,
  },
  {
    prompt: "社内システムへのログインについて、必ず設定することはどれですか。",
    choices: [
      "パスワードを付箋に書いて、パソコンに貼っておく",
      "ログインしたままにしておく",
      "スマートフォンの確認コードを使う二段階認証",
      "同僚とパスワードを共有する",
    ],
    answer: 2,
    explanation: "パスワードに加えて、スマートフォンの確認コードを使う二段階認証を必ず設定します。",
    quote: "社内システムには、パスワードに加えてスマートフォンの確認コードを使う二段階認証を必ず設定します。",
    difficulty: "normal",
    p: 0.85,
  },
  {
    prompt: "心当たりのない添付ファイルつきのメールが届きました。正しい対応はどれですか。",
    choices: [
      "開いて中身を確かめてから判断する",
      "送信者に返信して、本物かどうかを確かめる",
      "開かずに、情報システム担当に転送して確認を受ける",
      "すぐに削除し、誰にも伝えない",
    ],
    answer: 2,
    explanation: "開かずに情報システム担当に転送します。返信すると、相手に「このアドレスは使われている」と知らせてしまいます。",
    quote: "心当たりのない添付ファイルやリンクは開かずに、情報システム担当に転送して確認を受けます。",
    difficulty: "normal",
    p: 0.74,
    trap: { choice: 1, weight: 4 },
  },
  {
    prompt: "あやしい添付ファイルを開いてしまいました。最初にすることとして正しいものはどれですか。",
    choices: [
      "すぐにパソコンの電源を切る",
      "LANケーブルを抜くかWi-Fiを切ってから、情報システム担当に連絡する",
      "ウイルス対策ソフトで、自分で駆除する",
      "そのまま作業を続け、終業後に報告する",
    ],
    answer: 1,
    explanation: "まずネットワークから切り離します。電源を切ると、調査に必要な記録が消えてしまうことがあります。",
    quote: "すぐにパソコンのLANケーブルを抜くか、Wi-Fiを切ってから、情報システム担当に連絡します。",
    difficulty: "hard",
    p: 0.62,
    trap: { choice: 0, weight: 6 },
    dept: { "営業2課": -0.4 },
  },
  {
    prompt: "席を離れるときのパソコンの扱いとして、正しいものはどれですか。",
    choices: ["5分以内ならそのままでよい", "短い時間でも必ず画面をロックする", "電源を切る", "画面の明るさを下げておく"],
    answer: 1,
    explanation: "短い時間でも必ず画面をロックします。WindowsではWindowsキーとLキーでロックできます。",
    quote: "席を離れるときは、短い時間でも必ず画面をロックします。",
    difficulty: "easy",
    p: 0.88,
    trap: { choice: 0, weight: 3 },
  },
  {
    prompt: "社外で会社のパソコンを使うとき、つないではいけないものはどれですか。",
    choices: ["会社が貸し出しているモバイルルーター", "会社のスマートフォンのテザリング", "カフェや駅などの無料Wi-Fi", "会社の有線LAN"],
    answer: 2,
    explanation: "無料Wi-Fiは通信をのぞき見される危険があります。会社のモバイルルーターかテザリングを使います。",
    quote: "カフェや駅などの無料Wi-Fiには、会社のパソコンをつながないでください。",
    difficulty: "normal",
    p: 0.83,
    dept: { "営業1課": -0.2 },
  },
  {
    prompt: "OSやソフトの更新の通知が出たときの対応として、正しいものはどれですか。",
    choices: ["週末にまとめて更新する", "その日のうちに更新する", "月に1回、決まった日に更新する", "情報システム担当から指示があるまで待つ"],
    answer: 1,
    explanation: "更新を後回しにすると、弱点をねらった攻撃を受けやすくなります。その日のうちに更新します。",
    quote: "OSやソフトの更新の通知が出たら、その日のうちに更新してください。",
    difficulty: "normal",
    p: 0.78,
    trap: { choice: 0, weight: 3 },
  },
];

/** 下書きの例：AIが作った問題に「資料にない根拠」や「重複した選択肢」がまじっていた場合を体験できるようにする */
const HARASSMENT_DRAFT: Omit<QDef, "p">[] = [
  {
    prompt: "パワーハラスメントにあたらないものはどれですか。",
    choices: [
      "大声でどなる",
      "人前で長時間しかり続ける",
      "業務に必要な指導を、適切な言い方で行う",
      "仕事を与えずに孤立させる",
    ],
    answer: 2,
    explanation: "業務に必要な指導を適切な言い方で行うことは、パワーハラスメントにはあたりません。",
    quote: "業務に必要な指導を、適切な言い方で行うことはパワーハラスメントにはあたりません。",
    difficulty: "normal",
  },
  {
    prompt: "ハラスメントの相談窓口は、相談を受けてから何日以内に今後の進め方を連絡しますか。",
    choices: ["3営業日以内", "5営業日以内", "10営業日以内", "1か月以内"],
    answer: 1,
    explanation: "原則5営業日以内に、今後の進め方を相談者に連絡します。",
    quote: "相談窓口は、相談を受けてから原則5営業日以内に、今後の進め方を相談者に連絡します。",
    difficulty: "normal",
  },
  {
    prompt: "ハラスメントの相談をしたことを理由に、不利な扱いを受けた場合の罰則はどれですか。",
    choices: ["けん責", "減給", "出勤停止", "懲戒解雇"],
    answer: 3,
    explanation: "相談者への不利な扱いは、懲戒解雇の対象になります。",
    // 資料にはない文（AIの作り話の例）
    quote: "相談者に不利な扱いをした社員は、懲戒解雇の対象となります。",
    difficulty: "hard",
  },
  {
    prompt: "セクシュアルハラスメントについて、資料の内容に合っているものはどれですか。",
    choices: ["男性から女性への言動だけが対象", "同性どうしでも起こる", "男性から女性への言動だけが対象", "勤務時間の外の言動は対象外"],
    answer: 1,
    explanation: "男女どちらでも、また同性どうしでも起こります。",
    quote: "男女どちらでも、また同性どうしでも起こります。",
    difficulty: "easy",
  },
  {
    prompt: "ハラスメントを受けたと感じたとき、まずしておくとよいことはどれですか。",
    choices: [
      "いつ・どこで・誰に・何を言われたかを記録する",
      "相手に直接抗議する",
      "SNSで経緯を公開する",
      "しばらく様子を見て、何もしない",
    ],
    answer: 0,
    explanation: "できるだけ早く、いつ・どこで・誰に・何を言われたか、されたかを記録します。",
    quote: "いつ・どこで・誰に・何を言われたか、されたかを、できるだけ早く記録してください。",
    difficulty: "easy",
  },
];

function toQuestions(prefix: string, defs: Omit<QDef, "p">[], review: TestQuestion["review"]): TestQuestion[] {
  return defs.map((d, i) => ({
    id: `${prefix}-q${String(i + 1).padStart(2, "0")}`,
    prompt: d.prompt,
    choices: d.choices,
    answerIndex: d.answer,
    explanation: d.explanation,
    quote: d.quote,
    difficulty: d.difficulty,
    review,
    edited: false,
  }));
}

function material(id: string): Material {
  return MATERIALS.find((m) => m.id === id)!;
}

/** 受講・作成の時刻（9:00〜18:00の間の決まった時刻） */
const SLOTS: [number, number][] = [
  [9, 30], [10, 15], [11, 0], [11, 40], [13, 30], [14, 10], [14, 50], [15, 30], [16, 20], [17, 10],
];

/** base の日から、平日（土日を除く）で bizDaysAgo 日前の、決まった時刻。bizDaysAgo は1以上（今日・未来にはしない） */
export function weekdayAt(base: Date, bizDaysAgo: number, slot: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  let n = Math.max(1, bizDaysAgo);
  while (n > 0) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n--;
  }
  const [h, m] = SLOTS[((slot % SLOTS.length) + SLOTS.length) % SLOTS.length];
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export type SeedData = { people: Person[]; materials: Material[]; tests: Test[]; attempts: Attempt[] };

export const SEED_TEST_IDS = ["test-privacy", "test-security", "test-harassment-draft"];

export function createSeedData(now: Date = new Date()): SeedData {
  const rand = mulberry32(20261111);
  const at = (bizDaysAgo: number, slot: number) => weekdayAt(now, bizDaysAgo, slot);

  const privacy = material("mat-privacy");
  const security = material("mat-security");
  const harassment = material("mat-harassment");

  const tests: Test[] = [
    {
      id: "test-privacy",
      title: "個人情報の取り扱い 確認テスト",
      material: { id: privacy.id, title: privacy.title, body: privacy.body },
      status: "published",
      questions: toQuestions("test-privacy", PRIVACY_QS, "approved"),
      createdAt: at(14, 1),
      publishedAt: at(13, 0),
      // デモ用に人が書いた問題（AIは使っていない）
      aiSource: null,
      note: null,
      targetDepartments: null,
      generation: null,
    },
    {
      id: "test-security",
      title: "情報セキュリティの基本 確認テスト",
      material: { id: security.id, title: security.title, body: security.body },
      status: "published",
      questions: toQuestions("test-security", SECURITY_QS, "approved"),
      createdAt: at(7, 4),
      publishedAt: at(6, 0),
      aiSource: null,
      note: null,
      targetDepartments: null,
      generation: null,
    },
    {
      id: "test-harassment-draft",
      title: "ハラスメント防止 確認テスト",
      material: { id: harassment.id, title: harassment.title, body: harassment.body },
      status: "draft",
      questions: toQuestions("test-harassment-draft", HARASSMENT_DRAFT, "pending"),
      createdAt: at(1, 3),
      publishedAt: null,
      aiSource: null,
      note: "AIが作った問題に「資料にない根拠」や「重複した選択肢」がまじっていた場合の例です（デモ用に人が用意した下書き）。",
      targetDepartments: null,
      generation: null,
    },
  ];

  const learners = PEOPLE.filter((p) => p.role === "learner");
  // 受講者ごとの得意・不得意（-0.12〜+0.12）
  const skill = new Map(learners.map((l) => [l.id, (rand() - 0.5) * 0.24]));

  const attempts: Attempt[] = [];
  // retake：2回受けた人。1回目はもっと点が低く、そのあと資料を読み直して受け直した、という想定
  const plan: { test: Test; defs: QDef[]; skip: string[]; maxDaysAgo: number; retake: string[] }[] = [
    { test: tests[0], defs: PRIVACY_QS, skip: ["l-14"], maxDaysAgo: 12, retake: ["l-06", "l-10", "l-13"] },
    { test: tests[1], defs: SECURITY_QS, skip: ["l-08", "l-11", "l-14"], maxDaysAgo: 5, retake: ["l-02"] },
  ];
  for (const { test, defs, skip, maxDaysAgo, retake } of plan) {
    const takers = learners.filter((l) => !skip.includes(l.id));
    // 少人数でも狙った正答率に近づくよう、問題ごとに 0〜1 の値を受講者へ均等に散らして配る（層別）
    const draws = defs.map(() => {
      const order = shuffle(takers, rand);
      return new Map(order.map((l, i) => [l.id, (i + rand()) / takers.length]));
    });
    const wrongCount = defs.map(() => 0);
    for (const l of takers) {
      const answers = test.questions.map((q, i) => {
        const d = defs[i];
        const p = Math.min(0.98, Math.max(0.05, d.p + skill.get(l.id)! + (d.dept?.[l.department!] ?? 0)));
        if (draws[i].get(l.id)! < p) return { questionId: q.id, choice: d.answer };
        // 間違えるときは、選ばれやすい誤答に寄せる（重み5以上なら4回に3回、それ以外は3回に2回）
        const wrongs = [0, 1, 2, 3].filter((c) => c !== d.answer);
        const k = wrongCount[i]++;
        let choice: number;
        if (d.trap) {
          const cycle = d.trap.weight >= 5 ? 4 : 3;
          const others = wrongs.filter((c) => c !== d.trap!.choice);
          choice = k % cycle === cycle - 1 ? others[Math.floor(k / cycle) % others.length] : d.trap.choice;
        } else {
          choice = wrongs[k % wrongs.length];
        }
        return { questionId: q.id, choice };
      });
      const daysAgo = 1 + Math.floor(rand() * maxDaysAgo);
      const slot = Math.floor(rand() * SLOTS.length);
      if (retake.includes(l.id)) {
        // 1回目：今回の回答のうち、正解だった問題を2問だけ間違えていた（2回目の2〜3営業日前）
        // 公開日（maxDaysAgo + 1 営業日前）より前にはしない。公開日と同じ日なら、公開より後の夕方にする
        const firstDaysAgo = Math.min(maxDaysAgo + 1, daysAgo + 2);
        const firstSlot = firstDaysAgo === maxDaysAgo + 1 ? SLOTS.length - 1 : slot + 3;
        let flipped = 0;
        const first = answers.map((a, i) => {
          const d = defs[i];
          if (flipped >= 2 || a.choice !== d.answer || d.p > 0.9) return a;
          flipped++;
          return { ...a, choice: d.trap?.choice ?? (d.answer + 1) % 4 };
        });
        attempts.push({ id: `seed-${test.id}-${l.id}-1`, testId: test.id, learnerId: l.id, answers: first, at: at(firstDaysAgo, firstSlot) });
      }
      attempts.push({
        id: `seed-${test.id}-${l.id}`,
        testId: test.id,
        learnerId: l.id,
        answers,
        at: at(daysAgo, slot),
      });
    }
  }
  attempts.sort((a, b) => a.at.localeCompare(b.at));

  return { people: PEOPLE, materials: MATERIALS, tests, attempts };
}
