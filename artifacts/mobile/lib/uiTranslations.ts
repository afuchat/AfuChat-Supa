import { translateText } from "@/lib/translate";

export type UiLanguage = "en" | "sw" | "fr" | "es" | "ar" | "zh";

type TranslationTable = Record<string, string>;
let currentUiLanguage: string | null = null;

const LANGUAGE_ALIASES: Record<string, UiLanguage> = {
  en: "en",
  english: "en",
  sw: "sw",
  swa: "sw",
  swahili: "sw",
  kiswahili: "sw",
  fr: "fr",
  fra: "fr",
  fre: "fr",
  french: "fr",
  français: "fr",
  es: "es",
  spa: "es",
  spanish: "es",
  español: "es",
  ar: "ar",
  ara: "ar",
  arabic: "ar",
  العربية: "ar",
  zh: "zh",
  zho: "zh",
  chi: "zh",
  chinese: "zh",
  中文: "zh",
};

const TABLES: Record<UiLanguage, TranslationTable> = {
  en: {},
  sw: {
    Language: "Lugha",
    Settings: "Mipangilio",
    "Original (no translation)": "Asili (bila tafsiri)",
    "Show content in its original language": "Onyesha maudhui katika lugha yake ya asili",
    "When a language is selected, all messages and posts across the app are automatically translated into that language as you browse.": "Ukichagua lugha, ujumbe na machapisho yote kwenye programu yatatafsiriwa kiotomatiki katika lugha hiyo.",
    "Choose how AfuChat looks across the app.": "Chagua jinsi AfuChat ionekane kwenye programu nzima.",
    "Already have an account?": "Una akaunti tayari?",
    "Sign in": "Ingia",
    "Cancel": "Ghairi",
    "Save": "Hifadhi",
    "Done": "Imekamilika",
    "Search": "Tafuta",
    "Loading": "Inapakia",
    "Retry": "Jaribu tena",
    "Close": "Funga",
    "Back": "Rudi",
    "Language settings": "Mipangilio ya lugha",
    "Appearance": "Mwonekano",
    "Messaging": "Ujumbe",
    "Privacy & Security": "Faragha na Usalama",
    ACCOUNTS: "AKAUNTI",
    APPEARANCE: "MWONEKANO",
    MESSAGING: "UJUMBE",
    "PRIVACY & SECURITY": "FARAGHA NA USALAMA",
    "Chat Settings": "Mipangilio ya gumzo",
    "Blocked Users": "Watumiaji waliozuiwa",
    "Privacy": "Faragha",
    "System": "Mfumo",
    "Light": "Mwanga",
    "Dark": "Giza",
    "Active": "Inatumika",
    "Manage accounts": "Dhibiti akaunti",
    "Add another account": "Ongeza akaunti nyingine",
    "Add Another Account": "Ongeza Akaunti Nyingine",
    "Switch account?": "Badilisha akaunti?",
    "Your current session will be saved.": "Kikao chako cha sasa kitahifadhiwa.",
    Switch: "Badilisha",
    "Switch Failed": "Kubadilisha kumeshindikana",
    "Could not switch account.": "Haikuwezekana kubadilisha akaunti.",
    Premium: "Premium",
    "Welcome back": "Karibu tena",
    "Sign in to your AfuChat account": "Ingia kwenye akaunti yako ya AfuChat",
    "Continue with Google": "Endelea na Google",
    "Continue with GitHub": "Endelea na GitHub",
    "Continue with email": "Endelea kwa barua pepe",
    "Create a new account": "Fungua akaunti mpya",
    "Forgot password?": "Umesahau nenosiri?",
    "Don't have an account?": "Huna akaunti?",
    "Sign up": "Jisajili",
    "Email, @username, or phone": "Barua pepe, @jina la mtumiaji, au simu",
    Password: "Nenosiri",
    "Verify your email": "Thibitisha barua pepe yako",
    "Verify email": "Thibitisha barua pepe",
    "Create account": "Fungua akaunti",
    "Join millions of people on AfuChat": "Jiunge na mamilioni ya watu kwenye AfuChat",
    "Already have an account": "Una akaunti tayari",
    "Terms of Service": "Masharti ya Huduma",
    "Privacy Policy": "Sera ya Faragha",
    "Free forever ✦": "Bure daima ✦",
    "13 years of age or older": "Miaka 13 au zaidi",
    Chat: "Gumzo",
    Discover: "Gundua",
    Shorts: "Fupi",
    Apps: "Programu",
    ME: "MIMI",
    Story: "Hadithi",
    Post: "Chapisho",
    Video: "Video",
    Article: "Makala",
    Create: "Unda",
  },
  fr: {
    Language: "Langue",
    Settings: "Paramètres",
    "Original (no translation)": "Original (sans traduction)",
    "Show content in its original language": "Afficher le contenu dans sa langue d'origine",
    "When a language is selected, all messages and posts across the app are automatically translated into that language as you browse.": "Quand une langue est sélectionnée, tous les messages et publications de l'application sont automatiquement traduits dans cette langue.",
    "Choose how AfuChat looks across the app.": "Choisissez l'apparence d'AfuChat dans toute l'application.",
    "Sign in": "Se connecter",
    "Create account": "Créer un compte",
    Cancel: "Annuler",
    Save: "Enregistrer",
    Done: "Terminé",
    Search: "Rechercher",
    Loading: "Chargement",
    Retry: "Réessayer",
    Close: "Fermer",
    Back: "Retour",
    "Language settings": "Paramètres de langue",
    Appearance: "Apparence",
    Messaging: "Messagerie",
    "Privacy & Security": "Confidentialité et sécurité",
    ACCOUNTS: "COMPTES",
    APPEARANCE: "APPARENCE",
    MESSAGING: "MESSAGERIE",
    "PRIVACY & SECURITY": "CONFIDENTIALITÉ ET SÉCURITÉ",
    "Chat Settings": "Paramètres de discussion",
    "Blocked Users": "Utilisateurs bloqués",
    Privacy: "Confidentialité",
    System: "Système",
    Light: "Clair",
    Dark: "Sombre",
    Active: "Actif",
    Switch: "Changer",
    "Manage accounts": "Gérer les comptes",
    "Add another account": "Ajouter un autre compte",
    "Add Another Account": "Ajouter un autre compte",
    "Switch account?": "Changer de compte ?",
    "Your current session will be saved.": "Votre session actuelle sera enregistrée.",
    "Switch Failed": "Échec du changement",
    Premium: "Premium",
    "Welcome back": "Bon retour",
    "Sign in to your AfuChat account": "Connectez-vous à votre compte AfuChat",
    "Continue with Google": "Continuer avec Google",
    "Continue with GitHub": "Continuer avec GitHub",
    "Continue with email": "Continuer avec un e-mail",
    "Create a new account": "Créer un nouveau compte",
    "Forgot password?": "Mot de passe oublié ?",
    "Don't have an account?": "Vous n'avez pas de compte ?",
    "Sign up": "S'inscrire",
    "Email, @username, or phone": "E-mail, @nom d'utilisateur ou téléphone",
    Password: "Mot de passe",
    "Verify your email": "Vérifiez votre e-mail",
    "Verify email": "Vérifier l'e-mail",
    "Join millions of people on AfuChat": "Rejoignez des millions de personnes sur AfuChat",
    "Already have an account": "Vous avez déjà un compte",
    "Already have an account?": "Vous avez déjà un compte ?",
    "Terms of Service": "Conditions d'utilisation",
    "Privacy Policy": "Politique de confidentialité",
    "Free forever ✦": "Gratuit pour toujours ✦",
    "13 years of age or older": "Âgé de 13 ans ou plus",
    Chat: "Discussion",
    Discover: "Découvrir",
    Shorts: "Courtes vidéos",
    Apps: "Applications",
    ME: "MOI",
    Story: "Story",
    Post: "Publication",
    Video: "Vidéo",
    Article: "Article",
    Create: "Créer",
  },
  es: {
    Language: "Idioma",
    Settings: "Ajustes",
    "Original (no translation)": "Original (sin traducción)",
    "Show content in its original language": "Mostrar contenido en su idioma original",
    "When a language is selected, all messages and posts across the app are automatically translated into that language as you browse.": "Al seleccionar un idioma, todos los mensajes y publicaciones de la aplicación se traducen automáticamente a ese idioma.",
    "Choose how AfuChat looks across the app.": "Elige cómo se ve AfuChat en toda la aplicación.",
    "Sign in": "Iniciar sesión",
    "Create account": "Crear cuenta",
    Cancel: "Cancelar",
    Save: "Guardar",
    Done: "Listo",
    Search: "Buscar",
    Loading: "Cargando",
    Retry: "Reintentar",
    Close: "Cerrar",
    Back: "Atrás",
    "Language settings": "Ajustes de idioma",
    Appearance: "Apariencia",
    Messaging: "Mensajería",
    "Privacy & Security": "Privacidad y seguridad",
    ACCOUNTS: "CUENTAS",
    APPEARANCE: "APARIENCIA",
    MESSAGING: "MENSAJERÍA",
    "PRIVACY & SECURITY": "PRIVACIDAD Y SEGURIDAD",
    "Chat Settings": "Ajustes del chat",
    "Blocked Users": "Usuarios bloqueados",
    Privacy: "Privacidad",
    System: "Sistema",
    Light: "Claro",
    Dark: "Oscuro",
    Active: "Activo",
    Switch: "Cambiar",
    "Manage accounts": "Gestionar cuentas",
    "Add another account": "Añadir otra cuenta",
    "Add Another Account": "Añadir otra cuenta",
    "Switch account?": "¿Cambiar de cuenta?",
    "Your current session will be saved.": "Tu sesión actual se guardará.",
    "Switch Failed": "No se pudo cambiar",
    Premium: "Premium",
    "Welcome back": "Bienvenido de nuevo",
    "Sign in to your AfuChat account": "Inicia sesión en tu cuenta de AfuChat",
    "Continue with Google": "Continuar con Google",
    "Continue with GitHub": "Continuar con GitHub",
    "Continue with email": "Continuar con correo electrónico",
    "Create a new account": "Crear una cuenta nueva",
    "Forgot password?": "¿Olvidaste tu contraseña?",
    "Don't have an account?": "¿No tienes una cuenta?",
    "Sign up": "Registrarse",
    "Email, @username, or phone": "Correo, @usuario o teléfono",
    Password: "Contraseña",
    "Verify your email": "Verifica tu correo electrónico",
    "Verify email": "Verificar correo",
    "Join millions of people on AfuChat": "Únete a millones de personas en AfuChat",
    "Already have an account": "Ya tienes una cuenta",
    "Already have an account?": "¿Ya tienes una cuenta?",
    "Terms of Service": "Términos del servicio",
    "Privacy Policy": "Política de privacidad",
    "Free forever ✦": "Gratis para siempre ✦",
    "13 years of age or older": "13 años o más",
    Chat: "Chat",
    Discover: "Descubrir",
    Shorts: "Cortos",
    Apps: "Aplicaciones",
    ME: "YO",
    Story: "Historia",
    Post: "Publicación",
    Video: "Vídeo",
    Article: "Artículo",
    Create: "Crear",
  },
  ar: {
    Language: "اللغة",
    Settings: "الإعدادات",
    "Original (no translation)": "الأصلية (بدون ترجمة)",
    "Show content in its original language": "عرض المحتوى بلغته الأصلية",
    "When a language is selected, all messages and posts across the app are automatically translated into that language as you browse.": "عند اختيار لغة، ستُترجم جميع الرسائل والمنشورات في التطبيق تلقائياً إلى تلك اللغة.",
    "Choose how AfuChat looks across the app.": "اختر مظهر AfuChat في التطبيق بالكامل.",
    "Sign in": "تسجيل الدخول",
    "Create account": "إنشاء حساب",
    Cancel: "إلغاء",
    Save: "حفظ",
    Done: "تم",
    Search: "بحث",
    Loading: "جار التحميل",
    Retry: "إعادة المحاولة",
    Close: "إغلاق",
    Back: "رجوع",
    "Language settings": "إعدادات اللغة",
    Appearance: "المظهر",
    Messaging: "الرسائل",
    "Privacy & Security": "الخصوصية والأمان",
    ACCOUNTS: "الحسابات",
    APPEARANCE: "المظهر",
    MESSAGING: "الرسائل",
    "PRIVACY & SECURITY": "الخصوصية والأمان",
    "Chat Settings": "إعدادات الدردشة",
    "Blocked Users": "المستخدمون المحظورون",
    Privacy: "الخصوصية",
    System: "النظام",
    Light: "فاتح",
    Dark: "داكن",
    Active: "نشط",
    Switch: "تبديل",
    "Manage accounts": "إدارة الحسابات",
    "Add another account": "إضافة حساب آخر",
    "Add Another Account": "إضافة حساب آخر",
    "Switch account?": "تبديل الحساب؟",
    "Your current session will be saved.": "سيتم حفظ جلستك الحالية.",
    "Switch Failed": "فشل التبديل",
    Premium: "مميز",
    "Welcome back": "مرحباً بعودتك",
    "Sign in to your AfuChat account": "سجّل الدخول إلى حسابك في AfuChat",
    "Continue with Google": "المتابعة باستخدام Google",
    "Continue with GitHub": "المتابعة باستخدام GitHub",
    "Continue with email": "المتابعة باستخدام البريد الإلكتروني",
    "Create a new account": "إنشاء حساب جديد",
    "Forgot password?": "هل نسيت كلمة المرور؟",
    "Don't have an account?": "ليس لديك حساب؟",
    "Sign up": "إنشاء حساب",
    "Email, @username, or phone": "البريد الإلكتروني أو @اسم المستخدم أو الهاتف",
    Password: "كلمة المرور",
    "Verify your email": "تحقق من بريدك الإلكتروني",
    "Verify email": "تحقق من البريد الإلكتروني",
    "Join millions of people on AfuChat": "انضم إلى ملايين الأشخاص على AfuChat",
    "Already have an account": "لديك حساب بالفعل",
    "Already have an account?": "لديك حساب بالفعل؟",
    "Terms of Service": "شروط الخدمة",
    "Privacy Policy": "سياسة الخصوصية",
    "Free forever ✦": "مجاني إلى الأبد ✦",
    "13 years of age or older": "13 عاماً أو أكثر",
    Chat: "الدردشة",
    Discover: "اكتشف",
    Shorts: "مقاطع قصيرة",
    Apps: "التطبيقات",
    ME: "أنا",
    Story: "قصة",
    Post: "منشور",
    Video: "فيديو",
    Article: "مقال",
    Create: "إنشاء",
  },
  zh: {
    Language: "语言",
    Settings: "设置",
    "Original (no translation)": "原文（不翻译）",
    "Show content in its original language": "以原始语言显示内容",
    "When a language is selected, all messages and posts across the app are automatically translated into that language as you browse.": "选择语言后，应用中的消息和帖子会在浏览时自动翻译成该语言。",
    "Choose how AfuChat looks across the app.": "选择 AfuChat 在整个应用中的显示语言。",
    "Already have an account?": "已有账号？",
    "Sign in": "登录",
    Cancel: "取消",
    Save: "保存",
    Done: "完成",
    Search: "搜索",
    Loading: "加载中",
    Retry: "重试",
    Close: "关闭",
    Back: "返回",
    "Language settings": "语言设置",
    Appearance: "外观",
    Messaging: "消息",
    "Privacy & Security": "隐私与安全",
    ACCOUNTS: "账号",
    APPEARANCE: "外观",
    MESSAGING: "消息",
    "PRIVACY & SECURITY": "隐私与安全",
    "Chat Settings": "聊天设置",
    "Blocked Users": "已屏蔽用户",
    Privacy: "隐私",
    System: "系统",
    Light: "浅色",
    Dark: "深色",
    Active: "活跃",
    "Manage accounts": "管理账号",
    "Add another account": "添加其他账号",
    "Add Another Account": "添加其他账号",
    "Switch account?": "切换账号？",
    "Your current session will be saved.": "当前会话将会保存。",
    Switch: "切换",
    "Switch Failed": "切换失败",
    "Could not switch account.": "无法切换账号。",
    Premium: "高级版",
    "Welcome back": "欢迎回来",
    "Sign in to your AfuChat account": "登录你的 AfuChat 账号",
    "Continue with Google": "使用 Google 继续",
    "Continue with GitHub": "使用 GitHub 继续",
    "Continue with email": "使用邮箱继续",
    "Create a new account": "创建新账号",
    "Forgot password?": "忘记密码？",
    "Don't have an account?": "还没有账号？",
    "Sign up": "注册",
    "Email, @username, or phone": "邮箱、@用户名或手机号",
    Password: "密码",
    "Verify your email": "验证你的邮箱",
    "Verify email": "验证邮箱",
    "Join millions of people on AfuChat": "加入 AfuChat 的数百万用户",
    "Already have an account": "已有账号",
    "Terms of Service": "服务条款",
    "Privacy Policy": "隐私政策",
    "Free forever ✦": "永久免费 ✦",
    "13 years of age or older": "13 岁或以上",
    Chat: "聊天",
    Discover: "发现",
    Shorts: "短视频",
    Apps: "应用",
    ME: "我的",
    Story: "动态",
    Post: "帖子",
    Video: "视频",
    Article: "文章",
    Create: "创建",
    "Choose your language": "选择你的语言",
    "Select the language you understand best. We will use it to make your AfuChat experience easier to follow.": "选择你最熟悉的语言，我们会用它让 AfuChat 更容易使用。",
    Continue: "继续",
    "You can change this later in Settings.": "之后可以在设置中更改。",
    "Skip": "跳过",
    "Connect with\npurpose": "有目的地\n连接",
    "Build real connections, share what matters and make every interaction count.": "建立真实的连接，分享重要的内容，让每一次互动都有意义。",
    "See how it works": "了解使用方式",
    "Find your\npeople": "找到你的\n圈子",
    "Follow your interests, join communities and discover conversations worth returning to.": "关注你的兴趣，加入社区，发现值得持续参与的对话。",
    "Explore communities": "探索社区",
    "Create. Share.\nBe seen.": "创作、分享，\n让更多人看见。",
    "Post ideas, stories and moments that bring people together. AfuAI helps when you need it.": "发布想法、动态和让人们相聚的瞬间。需要时，AfuAI 会帮助你。",
    "Create your profile": "创建个人资料",
    "Your activity\nhas value": "你的每次参与\n都有价值",
    "Earn ACoin through participation, then use it for status, perks and a presence that feels like yours.": "通过参与赚取 ACoin，用它兑换身份标识、专属权益，打造属于你的存在感。",
    "Get started free": "免费开始",
    "Make your place on AfuChat": "建立你在 AfuChat 的位置",
    "Your profile is your starting point for meaningful connections, communities and ACoin rewards.": "你的个人资料是建立有意义连接、加入社区和获得 ACoin 奖励的起点。",
    "Stay connected": "保持联系",
    "Use your number for account recovery and to find people you already know. It is never shared publicly.": "你的手机号用于找回账号和寻找认识的人，不会公开分享。",
    "Choose what moves you": "选择你的兴趣",
    "Pick at least 3 interests so AfuChat can help you find the right people, communities and conversations.": "至少选择 3 个兴趣，AfuChat 才能帮你找到合适的人、社区和对话。",
    "Ready to connect?": "准备好建立连接了吗？",
    "Add a photo so people can recognise you, then start building your place in the AfuChat community.": "添加照片让别人认出你，然后开始建立你在 AfuChat 社区中的位置。",
  },
};

const REMOTE_TABLES = new Map<string, Map<string, string>>();
const REGISTERED_UI_TEXTS = new Set<string>();
const ATTEMPTED_REMOTE_TEXTS = new Map<string, Set<string>>();
const PRELOADS = new Map<string, Promise<void>>();
const UI_TRANSLATION_LISTENERS = new Set<() => void>();

function languageKey(language: string | null | undefined): string | null {
  if (!language) return null;
  return language.trim().toLowerCase().replace("_", "-").split("-")[0] || null;
}

function notifyUiTranslationListeners(): void {
  UI_TRANSLATION_LISTENERS.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

/**
 * Register UI copy discovered by the Babel transform. This includes static
 * Text content and literal input labels/placeholders, never runtime user data.
 */
export function registerUiTexts(texts: string[]): void {
  let added = false;
  for (const text of texts) {
    if (typeof text === "string" && text.trim().length >= 2 && !REGISTERED_UI_TEXTS.has(text)) {
      REGISTERED_UI_TEXTS.add(text);
      added = true;
    }
  }
  if (added && currentUiLanguage && currentUiLanguage !== "en") {
    preloadUiTranslations(currentUiLanguage)
      .then(notifyUiTranslationListeners)
      .catch(() => {});
  }
}

export function subscribeUiTranslations(listener: () => void): () => void {
  UI_TRANSLATION_LISTENERS.add(listener);
  return () => UI_TRANSLATION_LISTENERS.delete(listener);
}

/**
 * Translate registered interface copy in the background. Work is shared by
 * every screen and limited to small batches so a language change cannot flood
 * the translation endpoint.
 */
export function preloadUiTranslations(language: string): Promise<void> {
  const key = languageKey(language);
  if (!key || key === "en") return Promise.resolve();
  const existing = PRELOADS.get(key);
  if (existing) return existing;

  const work = (async () => {
    const remote = REMOTE_TABLES.get(key) ?? new Map<string, string>();
    REMOTE_TABLES.set(key, remote);
    const attempted = ATTEMPTED_REMOTE_TEXTS.get(key) ?? new Set<string>();
    ATTEMPTED_REMOTE_TEXTS.set(key, attempted);

    let pending = Array.from(REGISTERED_UI_TEXTS).filter(
      (text) =>
        !remote.has(text) &&
        !attempted.has(text) &&
        translateUi(text, key) === text,
    );
    // A route can register more copy while the first batch is running.
    for (let pass = 0; pass < 3 && pending.length > 0; pass++) {
      for (let i = 0; i < pending.length; i += 6) {
        const batch = pending.slice(i, i + 6);
        await Promise.all(
          batch.map(async (text) => {
            attempted.add(text);
            const translated = await translateText(text, key);
            if (translated && translated !== text) remote.set(text, translated);
          }),
        );
      }
      pending = Array.from(REGISTERED_UI_TEXTS).filter(
        (text) => !remote.has(text) && !attempted.has(text),
      );
    }
  })();

  PRELOADS.set(key, work);
  work.finally(() => PRELOADS.delete(key)).catch(() => {});
  return work;
}

export function translateUi(text: string, language: string | null | undefined): string {
  if (!text || !language) return text;
  const normalized = languageKey(language) ?? "";
  const uiLanguage = LANGUAGE_ALIASES[language.trim().toLowerCase()] ?? LANGUAGE_ALIASES[normalized];
  if (uiLanguage === "en" || normalized === "en") return text;
  return TABLES[uiLanguage as UiLanguage]?.[text] ?? REMOTE_TABLES.get(normalized)?.get(text) ?? text;
}

export function setCurrentUiLanguage(language: string | null): void {
  currentUiLanguage = language;
}

export function localizeUi(text: string): string {
  return translateUi(text, currentUiLanguage);
}
