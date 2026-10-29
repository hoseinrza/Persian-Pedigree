<div align="center">

# 🧬 شجره‌نامه ژنتیکی بالینی · Persian Clinical Pedigree Workbench

**سامانه پیشرفته ترسیم و تحلیل شجره‌نامه‌های ژنتیک پزشکی، مدل‌سازی ریسک مندلی و بررسی روابط خویشاوندی کاملاً سمت کلاینت.**

*A production-quality clinical & educational pedigree workbench for medical genetics, Mendelian risk modeling, and complex kinship layout — running entirely in-browser with zero telemetry.*

[![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-30%20passed-emerald)](tests/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

---

## 📑 فهرست مطالب / Table of Contents

- [فلسفه و معماری علمی / Scientific Philosophy](#-فلسفه-و-معماری-علمی--scientific-philosophy)
- [امکانات و قابلیت‌ها / Features](#-امکانات-و-قابلیت‌ها--features)
- [مدل‌سازی ژنتیکی و اعتبارسنجی ریسک / Genetic Risk Engine](#-مدل‌سازی-ژنتیکی-و-اعتبارسنجی-ریسک--genetic-risk-engine)
- [صحت داده‌ها و لایه اعتبارسنجی / Data Integrity & Validation](#-صحت-داده‌ها-و-لایه-اعتبارسنجی--data-integrity--validation)
- [عملکرد و بنچ‌مارک در ابعاد بزرگ / Performance & Benchmarks](#-عملکرد-و-بنچ‌مارک-در-ابعاد-بزرگ--performance--benchmarks)
- [حفظ حریم خصوصی و ذخیره‌سازی محلی / Privacy & Local Storage](#-حفظ-حریم-خصوصی-و-ذخیره‌سازی-محلی--privacy--local-storage)
- [راهنمای علائم بالینی / Clinical Pedigree Notation](#-راهنمای-علائم-بالینی--clinical-pedigree-notation)
- [دستورات تست و اجرا / Testing & Development](#-دستورات-تست-و-اجرا--testing--development)
- [مجوز / License](#-مجوز--license)

---

## 🔬 فلسفه و معماری علمی / Scientific Philosophy

این پلتفرم بر اساس استانداردهای بین‌المللی **ACMG (American College of Medical Genetics)** و **NSGC (National Society of Genetic Counselors)** برای ترسیم دقیق و بدون تداخل شجره‌نامه‌های بالینی بازمهندسی شده است. بر خلاف ابزارهای سنتی یا نمودارهای سلسله‌مراتبی عمومی، این سامانه چالش‌های پیچیده ژنتیک پزشکی شامل موارد زیر را به طور کامل پشتیبانی می‌کند:

1. **دوقلوها با زیگوتی‌های مختلف**:
   - دوقلوهای تک‌تخمی همسان (Monozygotic - MZ): رسم دوشاخه معکوس با خط افقی رابط (Horizontal twin bar).
   - دوقلوهای دو‌تخمی ناهمسان (Dizygotic - DZ): رسم دوشاخه همگام بدون خط افقی رابط.
   - دوقلو با زیگوتی نامشخص: رسم نماد `?` روی نقطه اتصال رأس دوقلو طبق استاندارد ACMG.
2. **ازدواج‌های خویشاوندی (Consanguinity)**:
   - شناسایی خودکار نیای مشترک و رسم خط ازدواج دوبل (Double mating line).
3. **ازدواج‌های مجدد و چندهمسری (Multi-Spouse & Remarriage)**:
   - تفکیک دقیق فرزندان بر اساس والد مادری و پدری بدون اختلاط شاخه‌ها.
4. **توالی‌های عمیق تا ۵۰ نسل**:
   - چیدمان افقی بهینه و تراز ستونی بدون تداخل خطوط والد-فرزندی.

---

## 🎯 امکانات و قابلیت‌ها / Features

| بخش | توضیحات فارسی | English Description |
|---|---|---|
| 📐 **موتور Layout اختصاصی** | محاسبه مختصات گره‌ها با مرتب‌سازی باری‌سنتریک، بدون تداخل و با خطوط ارتوگونال | Barycentric-ordered hierarchical layout with orthogonal collision-free routing |
| 🧬 **موتور ریسک مندلی** | تفکیک ژنوتیپ ($AA, Aa, aa$) از فنوتیپ و محاسبه احتمال شرطی بیزی | Rigorous Bayesian conditional probabilities for AR, AD, and X-linked models |
| 🛡️ **اعتبارسنجی متمرکز** | کشف چرخه‌های نامعتبر اجدادی (DAG cycles) و همگام‌سازی دوسویه روابط | Centralized validation, DAG cycle detection, and reciprocal relationship repair |
| 💾 **ذخیره‌سازی محلی ایمن** | مدیریت پرونده‌ها در حافظه مرورگر با نگارش شمای داده ۲ (`schemaVersion: 2`) | Local-first persistence with case indexing and zero server transmission |
| 📤 **خروجی‌های چندگانه** | خروجی JSON ساختاریافته، وکتور SVG، تصویر رندرشده PNG، و CSV سازگار با اکسل (UTF-8 BOM) | Export to JSON v2, high-res SVG, PNG, and RFC 4180 CSV with UTF-8 BOM |
| ♿ **دسترس‌پذیری و UX** | برچسب‌های ARIA، ناوبری کامل صفحه‌کلید (Escape, Delete, Ctrl+Z)، و تاییدیه پیش از حذف | Accessible ARIA labels, keyboard navigation, and confirmation dialogs |

---

## 🧮 مدل‌سازی ژنتیکی و اعتبارسنجی ریسک / Genetic Risk Engine

موتور محاسباتی در ماژول مجزای `src/domain/geneticRisk.js` بازطراحی شده است:

### ۱. وراثت اتوزوم مغلوب (Autosomal Recessive)
- **فرد مبتلا ($aa$)**: ژنوتیپ هموزیگوت جهش‌یافته دارد و به هیچ عنوان به اشتباه به عنوان ناقل هتروزیگوت بدون علامت ($Aa$) گزارش نمی‌شود ($P = 0.0$ برای ناقل خاموش بودن، با برچسب وضعیت `مبتلا`).
- **والدین فرزند مبتلا**: ناقلین اجباری هتروزیگوت قطعی محسوب می‌شوند ($P = 1.0$).
- **فرزند سالم والدین ناقل ($Aa \times Aa$)**: طبق فرمول بیز در فضای نمونه فرزندان غیرمبتلا ($AA + Aa$):
  $$P(Aa \mid \text{سالم}) = \frac{1/2}{1/4 + 1/2} = \frac{2}{3} \approx 66.7\%$$
  محاسبه دقیق ۲ از ۳ اعمال می‌شود و هرگز به اشتباه ۵۰٪ یا ۱۰۰٪ گزارش نمی‌شود.
- **اطلاعات ناکافی**: در صورت نبود شواهد و سابقه خانوادگی، به جای انتساب عدد ساختگی ۵٪، وضعیت **«اطلاعات ناکافی برای محاسبه»** اعلام می‌شود.

### ۲. وراثت وابسته به X مغلوب (X-Linked Recessive)
- تمام دختران یک پدر مبتلا ($X^a Y$) ناقل اجباری ($100\%$) هستند.

> ⚠️ **سلب مسئولیت آموزشی (Disclaimer):**
> محاسبات این نرم‌افزار صرفاً جنبه آموزشی و مدل‌سازی ریاضی داشته و هرگز جایگزین مشاوره ژنتیک بالینی یا آزمایش‌های ژنتیک تشخیصی نمی‌باشد.

---

## 🛡️ صحت داده‌ها و لایه اعتبارسنجی / Data Integrity & Validation

ماژول `src/domain/pedigreeValidation.js` قبل از هرگونه تغییر یا ورود فایل:
1. **تشخیص حلقه اجدادی (Cycle Detection)**: الگوریتم پیمایش عمقی (DFS) تضمین می‌کند هیچ فردی نمی‌تواند در سلسله اجداد خود قرار گیرد ($A \to B \to A$).
2. **بررسی دوقلوها**: دوقلوهای تک‌تخمی همسان (Identical MZ) الزاماً جنسیت بیولوژیک یکسان دارند؛ موارد متناقض مسدود می‌شوند.
3. **همگام‌سازی دوسویه**: چنانچه در فایلی همسری ثبت شده باشد ولی در طرف مقابل درج نشده باشد، سیستم به طور خودکار بدون دستکاری شاخه‌ها آن را همگام می‌کند.
4. **ایمنی Import**: فایل‌های مخدوش به هیچ وجه شجره‌نامه جاری را تخریب یا بازنویسی نمی‌کنند و گزارش خطای صریح به زبان فارسی نمایش داده می‌شود.

---

## ⚡ عملکرد و بنچ‌مارک در ابعاد بزرگ / Performance & Benchmarks

موتور چیدمان و الگوریتم‌های اعتبارسنجی با تست‌های بنچ‌مارک خودکار (`tests/benchmark.test.js`) ارزیابی شده‌اند:

| تعداد افراد در شجره‌نامه | عمق نسلی | تعداد اتصالات (Connectors) | مدت زمان محاسبه Layout |
|:---:|:---:|:---:|:---:|
| **~۱۰۰ نفر (۱۰۱ گره)** | ۶ نسل | ۶۳ اتصال | **۱۳.۳ میلی‌ثانیه** |
| **~۵۰۰ نفر (۵۰۱ گره)** | ۲۲ نسل | ۳۱۳ اتصال | **۳۷.۹ میلی‌ثانیه** |
| **~۱۰۰۰ نفر (۱۰۰۱ گره)** | ۳۸ نسل | ۶۲۵ اتصال | **۴۰.۴ میلی‌ثانیه** |

*محیط تست: Node.js v22 LTS / Linux x86_64.*
*نتیجه: الگوریتم به صورت شبه‌خطی $O(N)$ عمل کرده و برای شجره‌نامه‌های بزرگ بالینی بدون افت فریم اجرا می‌شود.*

---

## 🔒 حفظ حریم خصوصی و ذخیره‌سازی محلی / Privacy & Local Storage

- **۱۰۰٪ محلی (Zero Remote Telemetry)**: تمامی اطلاعات شجره‌نامه، نام‌ها، کدهای ژنتیکی و علائم بالینی در مرورگر کاربر باقی می‌مانند. هیچ داده‌ای به هیچ سروری ارسال نمی‌شود.
- **ذخیره در حافظه محلی مرورگر**: امکان ذخیره و بارگذاری چندین پرونده مستقل با کلید اختصاصی و شناسه یکتا از طریق دکمه «ذخیره در مرورگر» و پنجره «پرونده‌ها».

---

## 🩺 راهنمای علائم بالینی / Clinical Pedigree Notation

| نماد گرافیکی | عنوان فارسی | Scientific Meaning |
|:---:|---|---|
| ⬛ / ⬜ | مربع (مذکر) | Male (XY) |
| ⬤ / ⚪ | دایره (مونث) | Female (XX) |
| 🔷 / ◆ | لوزی (نامشخص) | Unknown sex |
| 🔴 | فنوتیپ مثبت (مبتلا) | Affected proband / individual |
| 🟠 | ناقل هتروزیگوت | Heterozygous carrier ($Aa$) |
| 🔵 | واریانت تاییدشده | Confirmed molecular mutation |
| ╲ | خط مورب | Deceased |
| ═ | خط دوبل ازدواج | Consanguineous mating |
| ∧═∧ | دوقلوی همسان (MZ) | Monozygotic twins with horizontal bar |
| ∧ ∧ | دوقلوی ناهمسان (DZ) | Dizygotic twins |
| ∧?∧ | دوقلو با زیگوتی نامشخص | Twins with unknown zygosity |

---

## 🚀 دستورات تست و اجرا / Testing & Development

### پیش‌نیازها
- **Node.js 18+** یا بالاتر

```bash
# نصب وابستگی‌ها
npm install

# اجرای تمام تست‌های خودکار (۳۰ تست در ۷ سوئیت)
npm test

# بررسی کیفیت کد و Linter
npm run lint

# ساخت نسخه نهایی Production
npm run build

# اجرای سرور توسعه محلی
npm run dev
```

---

## 📜 مجوز / License

تحت مجوز [MIT](LICENSE) منتشر شده است. استفاده و توسعه در محیط‌های دانشگاهی، پژوهشی و آموزشی آزاد است.
