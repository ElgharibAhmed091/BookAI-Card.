// server.js - Gemini + Fallback ذكي مع Prompt محسّن

require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const MODEL_NAME = "gemini-2.5-flash"; // نموذج شغال 100% في 2025

// إعداد Express
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ====== Gemini (اختياري) ======
let geminiModel = null;
if (process.env.GEMINI_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: MODEL_NAME });
    console.log("✅ Gemini AI جاهز!");
  } catch (err) {
    console.error("❌ فشل تحميل Gemini:", err.message);
  }
} else {
  console.log("⚠️ GEMINI_API_KEY مفقود → سيتم استخدام الردود الافتراضية");
}

// ====== قاعدة المعرفة (KB) ======
function normalize(msg) {
  return msg.trim().toLowerCase().replace(/[؟,.:!]/g, '').replace(/\s+/g, ' ');
}

const knowledgeBase = {
  "كيف حالك": [
    "الحمدلله أنا كويس، وماذا عنك؟",
    "أنا بخير، وأنت؟",
    "تمام! هل لديك استفسار عن الكتب؟"
  ],
  "انا مبتدئ بالقراءه اقترح لي كتب": [
    "جرب 'نظرية الفستق' لفهد الأحمدي – خفيف ومفيد.",
    "ابدأ بـ 'الخيميائي' لباولو كويلو – رواية ملهمة.",
    "أنصحك بـ 'رجال في الشمس' لغسان كنفاني – قصيرة وعميقة."
  ],
  "من نحن": [
    "نحن منصة 'بين الغلافين'، مجتمع لعشاق القراءة والكتابة.",
    "مرحبًا بك في 'بين الغلافين' – استشر، اقرأ، ناقش!"
  ],
  "اقترح لي كتاب عن السعادة": [
    "كتاب 'فن اللامبالاة' لمارك مانسون – يغير نظرتك للحياة.",
    "جرب 'المخطط السعادة' – عملي ومفيد جدًا."
  ],
  "السلام عليكم": [
    "وعليكم السلام ورحمة الله وبركاته"
  ]
};

// ردود عامة
const fallbackReplies = [
  "سؤال رائع! يمكنك البحث عن كتب في هذا الموضوع على موقعنا.",
  "أنصحك بزيارة قسم 'الكتب الموصى بها' على المنصة.",
  "هل تحب القراءة؟ جرب كتاب 'الخيميائي'، سيعجبك!",
  "لم أجد إجابة دقيقة، لكن يمكنك سؤال المجتمع في 'بين الغلافين'!"
];

// ====== تصحيح إملائي بسيط (بدون Gemini) ======
function simpleCorrect(text) {
  const corrections = {
    "قرايه": "قراءة",
    "سعاده": "سعادة",
    "انا": "أنا",
    "بحب": "أحب",
    "جدااا": "جدًا",
    "ليه": "لماذا",
    "ايه": "ماذا",
    "القرايه": "القراءة"
  };
  let corrected = text;
  for (const [wrong, right] of Object.entries(corrections)) {
    const regex = new RegExp(wrong, 'gi');
    corrected = corrected.replace(regex, right);
  }
  return corrected;
}

// ====== البحث في قاعدة المعرفة ======
function findKBAnswer(message) {
  const key = normalize(message);
  if (knowledgeBase[key]) {
    const answers = knowledgeBase[key];
    return answers[Math.floor(Math.random() * answers.length)];
  }
  return null;
}

// ====== استدعاء Gemini (آمن) ======
async function askGemini(prompt) {
  if (!geminiModel) return null;
  try {
    const result = await geminiModel.generateContent(prompt);
    const reply = result.response.text();
    return reply.trim();
  } catch (error) {
    console.error("خطأ Gemini:", error.message);
    return null;
  }
}

// ====== نقطة النهاية: /chat ======
app.post('/chat', async (req, res) => {
  let { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ reply: "أرسل رسالة صحيحة!" });
  }

  message = message.trim();
  if (!message) return res.status(400).json({ reply: "الرسالة فارغة!" });

  const original = message;
  const corrected = simpleCorrect(message);

  // 1. البحث في قاعدة المعرفة
  let reply = findKBAnswer(corrected);

  // 2. لو مفيش إجابة → جرب Gemini
  if (!reply && geminiModel) {
    const geminiPrompt = `أنت خبير أدبي ومساعد كتب ذكي. 
المهمة:
1. قم أولاً بتصحيح أي أخطاء إملائية أو نحوية في النص.
2. أجب على السؤال باللغة العربية بشكل واضح ومباشر.
3. إذا كان السؤال عن اقتراح كتب، قدم 2-3 اقتراحات مناسبة للمستوى المطلوب.
4. استخدم أمثلة عملية أو نصائح للقراءة إن أمكن.
5. اجعل الرد مختصرًا ومفيدًا، دون حشو زائد.

السؤال: "${corrected}"`;

    reply = await askGemini(geminiPrompt);
  }

  // 3. لو Gemini فشل → رد عام
  if (!reply) {
    reply = fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
  }

  // 4. إرجاع الرد
  res.json({
    reply,
    corrected: corrected !== original,
    original,
    fixed: corrected
  });
});

// ====== عرض الصفحة ======
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'chatbot.html'));
});

// ====== تشغيل السيرفر ======
app.listen(PORT, () => {
  console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`);
});
