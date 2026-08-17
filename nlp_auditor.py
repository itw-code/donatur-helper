#!/usr/bin/env python3
"""
Indonesian NLP Auditor & Content Enhancement Engine
Zero-dependency toolkit for analyzing, scoring, humanizing, and enhancing 
technical & copywriting content in Bahasa Indonesia.
"""

import sys
import re
import os
import glob
import json
import math
import argparse
from pathlib import Path
from html.parser import HTMLParser
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Tuple, Set, Optional, Any

# Force UTF-8 output on Windows console
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ==============================================================================
# 1. INDONESIAN LEXICON & MORPHOLOGY RULES (KBBI & EJAAN)
# ==============================================================================

# Standard KBBI / EYD replacements for common technical & colloquial errors
KBBI_CORRECTIONS = {
    "analisa": "analisis",
    "praktek": "praktik",
    "resiko": "risiko",
    "obyek": "objek",
    "subyek": "subjek",
    "merubah": "mengubah",
    "merestart": "memulai ulang (restart)",
    "meng-uninstall": "mencopot pemasangan (uninstall)",
    "di-uninstall": "dicopot pemasangannya (uninstalled)",
    "meng-install": "memasang (install)",
    "di-install": "dipasang (installed)",
    "di-lock": "dikunci",
    "meng-encrypt": "mengenkripsi",
    "di-encrypt": "dienkripsi",
    "di-block": "diblokir",
    "meng-copy": "menyalin",
    "di-copy": "disalin",
    "assesment": "penilaian / audit",
    "privilege": "hak akses",
    "credential": "kredensial",
    "koneksitas": "konektivitas",
    "efektifitas": "efektivitas",
    "aktifitas": "aktivitas",
    "kualitas": "kualitas",
    "ijin": "izin",
    "standard": "standar",
    "jadual": "jadwal",
    "silahkan": "silakan",
    "anti-virus": "antivirus",
    "multi-faktor": "multifaktor",
    "non-aktif": "nonaktif",
    "sub-folder": "subfolder",
}

# Preposition vs Prefix spacing rules
PREPOSITION_FIXES = [
    (r"\bdimana\b", "di mana"),
    (r"\bdisana\b", "di sana"),
    (r"\bdisini\b", "di sini"),
    (r"\bdisamping\b", "di samping"),
    (r"\bdiatas\b", "di atas"),
    (r"\bdibawah\b", "di bawah"),
    (r"\bkedepan\b", "ke depan"),
    (r"\bkemana\b", "ke mana"),
]

# ==============================================================================
# 2. ANTI-AI SLOP & HUMANIZER PATTERNS (BAHASA INDONESIA)
# ==============================================================================

AI_SLOP_RULES = [
    # 1. Undue emphasis / puffery / fake significance
    (
        r"\b(merupakan bukti nyata|tonggak sejarah penting|menjadi saksi bisu|bukti tak terbantahkan)\b",
        "AI Puffery",
        "Hindari klaim signifikansi artifisial ('bukti nyata', 'tonggak sejarah'). Sampaikan fakta langsung.",
        "High"
    ),
    # 2. Cliché AI metaphors / landscape words
    (
        r"\b(dalam lanskap (keamanan|digital|teknologi)|lanskap yang terus berkembang|menyelami lebih dalam|menjelajahi seluk-beluk)\b",
        "AI Cliché Metaphor",
        "Ganti metafora AI ('lanskap keamanan', 'menyelami') dengan istilah lugas.",
        "High"
    ),
    # 3. Filler and throat-clearing phrases
    (
        r"\b(sangat penting untuk (dicatat|diingat|dipahami) bahwa|perlu digarisbawahi bahwa|tidak dapat dipungkiri bahwa|seperti yang kita ketahui bersama)\b",
        "Filler / Throat-Clearing",
        "Hapus frasa pembuka basa-basi. Langsung ke pokok informasi.",
        "Medium"
    ),
    # 4. Copula avoidance (overly formal substitution for 'adalah / merupakan')
    (
        r"\b(berfungsi sebagai sebuah|bertindak sebagai garda terdepan|hadir untuk menawarkan|berdiri kokoh sebagai)\b",
        "Copula Avoidance",
        "Gunakan kata kerja aktif atau kopula sederhana ('adalah', 'merupakan', 'berfungsi').",
        "Medium"
    ),
    # 5. Em Dash / En Dash check (§14 Humanizer contract)
    (
        r"[—–]",
        "Em/En Dash Violation",
        "Ganti em-dash (—) atau en-dash (–) dengan tanda koma, titik dua, tanda kurung, atau titik.",
        "High"
    ),
    # 6. Negative parallelisms
    (
        r"\b(tidak hanya .+? melainkan juga|bukan sekadar .+? tetapi sebuah)\b",
        "Negative Parallelism",
        "Ganti konstruksi 'tidak hanya... tetapi juga' dengan kalimat deklaratif lugas.",
        "Low"
    ),
    # 7. Conversational fake-intimacy rhetorical openers
    (
        r"\b(jujur saja\?|tahukah Anda\?|jujur saja|tahukah Anda|mari kita bicara jujur|mari kita bedah bersama)",
        "Theatrical Rhetorical Opener",
        "Hindari pembuka retoris teatrikal buatan AI.",
        "Medium"
    )
]

# ==============================================================================
# 3. SASTRAWI-INSPIRED MORPHOLOGICAL STEMMER FOR INDONESIAN
# ==============================================================================

class IndonesianMorphology:
    """Rules-based morphological stemmer and affix analyzer for Bahasa Indonesia."""
    
    VOWELS = set("aiueo")
    
    @classmethod
    def count_syllables(cls, word: str) -> int:
        """Count syllables in an Indonesian word based on vowel nuclei and diphthongs."""
        word = word.lower().strip()
        if not word:
            return 0
        
        # Collapse common Indonesian diphthongs/digraphs
        cleaned = re.sub(r"(ai|au|oi|ei)", "a", word)
        vowel_count = sum(1 for char in cleaned if char in cls.VOWELS)
        return max(1, vowel_count)

    @classmethod
    def analyze_affixes(cls, word: str) -> Dict[str, Any]:
        """Deconstruct an Indonesian word into prefix, root, and suffix candidates."""
        original = word.lower()
        clean = re.sub(r"[^a-z]", "", original)
        
        prefix = ""
        suffix = ""
        stem = clean
        
        # Suffix removal
        # Inflectional particle suffix: -lah, -kah, -pun, -tah
        if re.search(r"(lah|kah|pun|tah)$", stem) and len(stem) > 5:
            suffix = stem[-3:] + suffix
            stem = stem[:-3]
            
        # Possessive pronoun suffix: -ku, -mu, -nya
        if re.search(r"(ku|mu|nya)$", stem) and len(stem) > 4:
            suffix = (stem[-3:] if stem.endswith("nya") else stem[-2:]) + suffix
            stem = stem[:-3] if stem.endswith("nya") else stem[:-2]
            
        # Derivational suffix: -kan, -an, -i
        if stem.endswith("kan") and len(stem) > 5:
            suffix = "kan" + suffix
            stem = stem[:-3]
        elif stem.endswith("an") and len(stem) > 4:
            suffix = "an" + suffix
            stem = stem[:-2]
        elif stem.endswith("i") and len(stem) > 4:
            suffix = "i" + suffix
            stem = stem[:-1]
            
        # Derivational prefix removal
        if stem.startswith("meng") and len(stem) > 6:
            prefix += "meng-"
            stem = stem[4:]
        elif stem.startswith("meny") and len(stem) > 6:
            prefix += "meny-"
            stem = "s" + stem[4:] # e.g. menyapu -> sapu
        elif stem.startswith("mem") and len(stem) > 5:
            prefix += "mem-"
            # memotong -> potong, membuat -> buat
            if stem[3] in "aiueo":
                stem = "p" + stem[3:]
            else:
                stem = stem[3:]
        elif stem.startswith("men") and len(stem) > 5:
            prefix += "men-"
            # menulis -> tulis, mendata -> data
            if stem[3] in "aiueo":
                stem = "t" + stem[3:]
            else:
                stem = stem[3:]
        elif stem.startswith("me") and len(stem) > 4:
            prefix += "me-"
            stem = stem[2:]
        elif stem.startswith("peng") and len(stem) > 6:
            prefix += "peng-"
            stem = stem[4:]
        elif stem.startswith("peny") and len(stem) > 6:
            prefix += "peny-"
            stem = "s" + stem[4:]
        elif stem.startswith("pem") and len(stem) > 5:
            prefix += "pem-"
            stem = stem[3:]
        elif stem.startswith("pen") and len(stem) > 5:
            prefix += "pen-"
            stem = stem[3:]
        elif stem.startswith("per") and len(stem) > 5:
            prefix += "per-"
            stem = stem[3:]
        elif stem.startswith("pe") and len(stem) > 4:
            prefix += "pe-"
            stem = stem[2:]
        elif stem.startswith("ber") and len(stem) > 5:
            prefix += "ber-"
            stem = stem[3:]
        elif stem.startswith("ter") and len(stem) > 5:
            prefix += "ter-"
            stem = stem[3:]
        elif stem.startswith("di") and len(stem) > 4:
            prefix += "di-"
            stem = stem[2:]
        elif stem.startswith("ke") and len(stem) > 4:
            prefix += "ke-"
            stem = stem[2:]
        elif stem.startswith("se") and len(stem) > 4:
            prefix += "se-"
            stem = stem[2:]

        return {
            "original": original,
            "prefix": prefix,
            "suffix": suffix,
            "root_guess": stem
        }


# ==============================================================================
# 4. READABILITY SCORER FOR INDONESIAN (FLESCH-INDO METRICS)
# ==============================================================================

class IndonesianReadability:
    """Calculates readability and complexity metrics tailored to Indonesian sentence cadence."""
    
    @classmethod
    def score_text(cls, text: str) -> Dict[str, Any]:
        sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
        words = [w.strip() for w in re.findall(r"\b[a-zA-Z0-9_-]+\b", text) if w.strip()]
        
        if not sentences or not words:
            return {
                "reading_ease": 100.0,
                "grade_level": "SD / Pemula",
                "category": "Sangat Mudah Dibaca (Gaya Tutur / Kasual)",
                "sentence_count": 0,
                "word_count": 0,
                "avg_sentence_length": 0.0,
                "avg_syllables_per_word": 0.0
            }
            
        total_syllables = sum(IndonesianMorphology.count_syllables(w) for w in words)
        
        asl = len(words) / max(1, len(sentences)) # Average Sentence Length
        asw = total_syllables / max(1, len(words)) # Average Syllables per Word
        
        # Indonesian Flesch-Kincaid adapted formula:
        # Bahasa Indonesia naturally has longer words (more syllables due to agglutinative affixes)
        # Standard calibration: Base 206.835 - (1.1 * ASL) - (55.0 * ASW)
        reading_ease = 206.835 - (1.1 * asl) - (55.0 * asw)
        reading_ease = max(0.0, min(100.0, reading_ease))
        
        if reading_ease >= 80:
            category = "Sangat Mudah Dibaca (Gaya Tutur / Kasual)"
            grade = "SD / Pemula"
        elif reading_ease >= 65:
            category = "Mudah & Mengalir (Cocok untuk Karyawan Umum)"
            grade = "SMP / Menengah"
        elif reading_ease >= 50:
            category = "Standar Teknis (Butuh Pemahaman IT Dasar)"
            grade = "SMA / Profesional"
        elif reading_ease >= 35:
            category = "Cukup Kompleks / Birokratis"
            grade = "Akademik / Sarjana"
        else:
            category = "Sangat Sulit / Terlalu Padat (Perlu Disederhanakan)"
            grade = "Pakar / Spesialis Keamanan"
            
        return {
            "reading_ease": round(reading_ease, 1),
            "category": category,
            "grade_level": grade,
            "sentence_count": len(sentences),
            "word_count": len(words),
            "avg_sentence_length": round(asl, 1),
            "avg_syllables_per_word": round(asw, 2)
        }


# ==============================================================================
# 5. HTML TEXT EXTRACTOR
# ==============================================================================

class ContentExtractor(HTMLParser):
    """Extracts prose text while preserving location and ignoring scripts/styles."""
    
    def __init__(self):
        super().__init__()
        self.text_blocks = []
        self.current_tag = ""
        self.ignore = False
        
    def handle_starttag(self, tag, attrs):
        self.current_tag = tag.lower()
        if self.current_tag in ("script", "style", "svg", "noscript"):
            self.ignore = True
            
    def handle_endtag(self, tag):
        if tag.lower() in ("script", "style", "svg", "noscript"):
            self.ignore = False
            
    def handle_data(self, data):
        if not self.ignore:
            stripped = data.strip()
            if stripped and len(stripped) > 2:
                self.text_blocks.append(stripped)


# ==============================================================================
# 6. MAIN AUDITOR & ENHANCEMENT SUITE
# ==============================================================================

@dataclass
class AuditFinding:
    category: str
    severity: str
    issue: str
    suggestion: str
    context: str = ""
    line_hint: int = 0

@dataclass
class AuditReport:
    file_path: str
    total_words: int
    readability: Dict[str, Any]
    findings: List[AuditFinding] = field(default_factory=list)
    score: int = 100

@dataclass
class BatchAuditReport:
    total_files: int
    total_words: int
    avg_score: float
    avg_reading_ease: float
    severity_breakdown: Dict[str, int]
    reports: List[AuditReport] = field(default_factory=list)
    errors: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "summary": {
                "total_files": self.total_files,
                "total_words": self.total_words,
                "avg_score": self.avg_score,
                "avg_reading_ease": self.avg_reading_ease,
                "severity_breakdown": self.severity_breakdown
            },
            "files": [asdict(r) for r in self.reports],
            "errors": self.errors
        }

class IndonesianNLPAuditor:
    """Comprehensive auditor for Indonesian technical & copywriting documents."""
    
    def __init__(self, custom_rules: Optional[List] = None):
        self.slop_rules = AI_SLOP_RULES + (custom_rules or [])
        self.kbbi_rules = KBBI_CORRECTIONS
        self.prep_rules = PREPOSITION_FIXES

    def audit_text(self, text: str, file_path: str = "<text>") -> AuditReport:
        """Audits raw text directly for NLP compliance and readability."""
        readability = IndonesianReadability.score_text(text)
        findings: List[AuditFinding] = []
        
        # 1. Audit AI Slop patterns
        for pattern, cat, fix_advice, sev in self.slop_rules:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                # Extract surrounding context
                start = max(0, match.start() - 35)
                end = min(len(text), match.end() + 35)
                snippet = "..." + text[start:end].replace("\n", " ") + "..."
                
                findings.append(AuditFinding(
                    category=cat,
                    severity=sev,
                    issue=f"Terdeteksi pola AI/Slop: '{match.group(0)}'",
                    suggestion=fix_advice,
                    context=snippet
                ))
                
        # 2. Audit KBBI / Ejaan spelling & terminology
        for wrong, correct in self.kbbi_rules.items():
            pattern = rf"\b{re.escape(wrong)}\b"
            for match in re.finditer(pattern, text, re.IGNORECASE):
                start = max(0, match.start() - 30)
                end = min(len(text), match.end() + 30)
                snippet = "..." + text[start:end].replace("\n", " ") + "..."
                
                findings.append(AuditFinding(
                    category="Ejaan & Kosakata KBBI",
                    severity="Medium" if "di-" in wrong or "meng-" in wrong else "Low",
                    issue=f"Bentuk non-standar: '{match.group(0)}'",
                    suggestion=f"Gunakan istilah standar: '{correct}'",
                    context=snippet
                ))
                
        # 3. Audit Prepositions (di/ke)
        for pattern, correct in self.prep_rules:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                start = max(0, match.start() - 30)
                end = min(len(text), match.end() + 30)
                snippet = "..." + text[start:end].replace("\n", " ") + "..."
                
                findings.append(AuditFinding(
                    category="Tata Bahasa (Kata Depan)",
                    severity="Low",
                    issue=f"Penulisan kata depan digabung: '{match.group(0)}'",
                    suggestion=f"Pisahkan kata depan: '{correct}'",
                    context=snippet
                ))
                
        # Calculate overall quality score (0 - 100)
        penalty = 0
        for f in findings:
            if f.severity == "High":
                penalty += 5
            elif f.severity == "Medium":
                penalty += 2
            else:
                penalty += 1
            
        score = max(0, 100 - penalty)
        
        return AuditReport(
            file_path=str(file_path),
            total_words=readability["word_count"],
            readability=readability,
            findings=findings,
            score=score
        )
        
    def audit_file(self, file_path: str) -> AuditReport:
        """Audits a single file (Markdown, text, or HTML)."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File tidak ditemukan: {file_path}")
        if path.is_dir():
            raise IsADirectoryError(f"Path adalah direktori: {file_path}")
            
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                raw_content = f.read()
        except Exception as e:
            raise IOError(f"Gagal membaca file '{file_path}': {e}")
            
        # Parse text
        if path.suffix.lower() in (".html", ".htm"):
            parser = ContentExtractor()
            parser.feed(raw_content)
            extracted_text = " ".join(parser.text_blocks)
        else:
            extracted_text = raw_content
            
        return self.audit_text(extracted_text, file_path=str(path))

    def audit_batch(self, file_paths: List[str]) -> BatchAuditReport:
        """Audits multiple files and compiles aggregated metrics."""
        reports: List[AuditReport] = []
        errors: List[Dict[str, str]] = []
        
        for path_str in file_paths:
            p = Path(path_str)
            if not p.exists():
                errors.append({"file": path_str, "error": "File tidak ditemukan"})
                continue
            if p.is_dir():
                errors.append({"file": path_str, "error": "Path adalah direktori"})
                continue
            try:
                report = self.audit_file(str(p))
                reports.append(report)
            except Exception as e:
                errors.append({"file": path_str, "error": str(e)})
                
        total_files = len(reports)
        total_words = sum(r.total_words for r in reports)
        avg_score = round(sum(r.score for r in reports) / max(1, total_files), 1) if total_files > 0 else 0.0
        avg_reading_ease = round(sum(r.readability["reading_ease"] for r in reports) / max(1, total_files), 1) if total_files > 0 else 0.0
        
        severity_breakdown = {"High": 0, "Medium": 0, "Low": 0}
        for r in reports:
            for f in r.findings:
                sev = f.severity
                severity_breakdown[sev] = severity_breakdown.get(sev, 0) + 1
                    
        return BatchAuditReport(
            total_files=total_files,
            total_words=total_words,
            avg_score=avg_score,
            avg_reading_ease=avg_reading_ease,
            severity_breakdown=severity_breakdown,
            reports=reports,
            errors=errors
        )

    def generate_html_enhancement_data(self) -> Dict[str, Any]:
        """Provides embedded Indonesian NLP synonym database and FAQ index for client-side search."""
        return {
            "synonyms": {
                "pantau": ["lacak", "sadap", "intip", "monitoring", "audit", "lihat", "inspeksi", "rekam"],
                "hapus": ["copot", "uninstall", "buang", "bersihkan", "delete", "remove", "hilang"],
                "riwayat": ["browser", "web", "situs", "youtube", "history", "internet", "traffic", "pencarian"],
                "aman": ["isolasi", "virtual machine", "vm", "dual boot", "privasi", "lindung", "solusi"],
                "kunci": ["password", "sandi", "proteksi", "block", "cegah", "larang", "izin"],
                "kantor": ["perusahaan", "bos", "admin", "it", "atasan", "perusahaan", "byod"]
            },
            "intent_rules": [
                {
                    "intent": "browser_privacy",
                    "keywords": ["browser", "riwayat", "history", "youtube", "web", "traffic", "wifi"],
                    "answer": "IT kantor HANYA bisa memantau seluruh traffic browser jika Full-Tunnel VPN aktif atau Root CA kantor dipasang di browser. Jika Split-Tunnel aktif dan tanpa sertifikat CA khusus, browsing pribadi di rumah tidak dapat diintip.",
                    "target_section": "matrix"
                },
                {
                    "intent": "uninstall_block",
                    "keywords": ["uninstall", "copot", "hapus", "password", "tamper", "susah"],
                    "answer": "Jika admin IT mengaktifkan Tamper Protection, Anda memerlukan token/password uninstal resmi dari IT. Alternatif darurat: masuk ke Safe Mode (Windows) atau Recovery Mode (macOS) untuk mematikan service SealSuite.",
                    "target_section": "faq"
                },
                {
                    "intent": "isolation_solution",
                    "keywords": ["isolasi", "vm", "virtualbox", "utm", "dual boot", "aman", "laptop pribadi", "byod"],
                    "answer": "Solusi terbaik dan teraman di laptop pribadi: pasang SealSuite di dalam Virtual Machine (UTM/VirtualBox) atau OS terpisah (Dual Boot). Dengan cara ini, SealSuite 100% terisolasi dari file dan akun pribadi Anda.",
                    "target_section": "remediation"
                }
            ]
        }


# ==============================================================================
# 7. REPORT PRESENTATION (CLI FORMATTERS)
# ==============================================================================

def format_audit_report(report: AuditReport) -> str:
    """Formats a single audit report as a structured string."""
    lines = []
    lines.append("=" * 80)
    lines.append(f" 🇮🇩  INDONESIAN NLP CONTENT AUDIT REPORT: {Path(report.file_path).name}")
    lines.append("=" * 80)
    lines.append(f"📊 Skor Kualitas Konten  : {report.score}/100")
    lines.append(f"📝 Total Kata            : {report.total_words} kata")
    lines.append(f"📖 Indeks Keterbacaan   : {report.readability['reading_ease']} ({report.readability['category']})")
    lines.append(f"🎯 Target Audiens         : {report.readability['grade_level']}")
    lines.append(f"📏 Rata-rata Panjang     : {report.readability['avg_sentence_length']} kata/kalimat ({report.readability['avg_syllables_per_word']} suku kata/kata)")
    lines.append("-" * 80)
    
    if not report.findings:
        lines.append("✅ Luar biasa! Tidak ditemukan pola AI slop, kesalahan ejaan, atau tata bahasa.")
    else:
        lines.append(f"⚠️  Ditemukan {len(report.findings)} catatan perbaikan:\n")
        
        # Group by severity
        for idx, finding in enumerate(report.findings[:25], 1): # Show top 25
            sev_icon = "🔴" if finding.severity == "High" else ("🟡" if finding.severity == "Medium" else "🔵")
            lines.append(f" [{idx}] {sev_icon} [{finding.category}] (Tingkat: {finding.severity})")
            lines.append(f"     Masalah   : {finding.issue}")
            lines.append(f"     Solusi    : {finding.suggestion}")
            if finding.context:
                lines.append(f"     Konteks   : {finding.context}")
            lines.append("")
            
        if len(report.findings) > 25:
            lines.append(f"... dan {len(report.findings) - 25} catatan lainnya tersimpan dalam format JSON.")
            
    lines.append("=" * 80)
    return "\n".join(lines)


def print_audit_report(report: AuditReport):
    """Pretty prints the single audit report to console."""
    print(format_audit_report(report))


def format_batch_report(batch: BatchAuditReport) -> str:
    """Formats a batch audit summary report as a structured string."""
    lines = []
    lines.append("=" * 80)
    lines.append(" 🇮🇩  INDONESIAN NLP CONTENT BATCH AUDIT REPORT")
    lines.append("=" * 80)
    lines.append(f"📁 Total File Diaudit    : {batch.total_files} file")
    lines.append(f"📝 Total Kata             : {batch.total_words:,} kata")
    lines.append(f"📊 Rata-rata Skor Konten : {batch.avg_score}/100")
    lines.append(f"📖 Rata-rata Reading Ease: {batch.avg_reading_ease}")
    high_cnt = batch.severity_breakdown.get("High", 0)
    med_cnt = batch.severity_breakdown.get("Medium", 0)
    low_cnt = batch.severity_breakdown.get("Low", 0)
    total_findings = high_cnt + med_cnt + low_cnt
    lines.append(f"🚨 Rincian Temuan        : 🔴 High: {high_cnt} | 🟡 Medium: {med_cnt} | 🔵 Low: {low_cnt} (Total: {total_findings})")
    lines.append("-" * 80)
    lines.append(" Ringkasan Per File:")
    lines.append("-" * 80)
    lines.append(f" {'No':<3} | {'File':<36} | {'Kata':<7} | {'Skor':<5} | {'Readability':<11} | {'Temuan (H/M/L)'}")
    lines.append(f" {'-'*3}-|-{'-'*36}-|-{'-'*7}-|-{'-'*5}-|-{'-'*11}-|-{'-'*14}")
    for idx, r in enumerate(batch.reports, 1):
        fname = Path(r.file_path).name
        if len(fname) > 36:
            fname = fname[:33] + "..."
        h = sum(1 for f in r.findings if f.severity == "High")
        m = sum(1 for f in r.findings if f.severity == "Medium")
        l = sum(1 for f in r.findings if f.severity == "Low")
        findings_str = f"{len(r.findings)} ({h}/{m}/{l})"
        ease_str = f"{r.readability['reading_ease']}"
        lines.append(f" {idx:<3} | {fname:<36} | {r.total_words:<7} | {r.score:<5} | {ease_str:<11} | {findings_str}")
        
    if batch.errors:
        lines.append("-" * 80)
        lines.append(f"⚠️  File dengan error ({len(batch.errors)}):")
        for err in batch.errors:
            lines.append(f"  - {err['file']}: {err['error']}")
            
    lines.append("=" * 80)
    return "\n".join(lines)


def print_batch_report(batch: BatchAuditReport):
    """Pretty prints the batch audit report to console."""
    print(format_batch_report(batch))


def output_result(content: str, output_path: Optional[str] = None):
    """Outputs text/JSON to stdout or writes to file if output_path is provided."""
    if output_path:
        try:
            out_p = Path(output_path)
            out_p.parent.mkdir(parents=True, exist_ok=True)
            with open(out_p, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"[INFO] Laporan berhasil disimpan ke: {output_path}")
        except Exception as e:
            print(f"[ERROR] Gagal menulis output ke '{output_path}': {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print(content)


# ==============================================================================
# 8. AUTOMATED SELF-TEST SUITE
# ==============================================================================

def run_self_tests() -> bool:
    """
    Executes comprehensive zero-dependency automated self-test suite.
    Verifies:
      1. KBBI corrections dictionary matching.
      2. Preposition spacing rules.
      3. Syllable counter and diphthong parsing.
      4. Readability score calculation formula correctness.
      5. AI slop detector detection patterns across all rules.
    """
    print("=" * 80)
    print(" 🧪 INDONESIAN NLP AUDITOR - AUTOMATED SELF-TEST SUITE")
    print("=" * 80)

    total_groups = 5
    passed_groups = 0
    total_assertions = 0

    auditor = IndonesianNLPAuditor()

    # --------------------------------------------------------------------------
    # Group 1: Indonesian KBBI Corrections Dictionary Matching
    # --------------------------------------------------------------------------
    print("\n [1/5] Testing KBBI Corrections Dictionary Matching...")
    g1_passed = True
    g1_assertions = 0
    try:
        # Test all dictionary entries
        for wrong, correct in KBBI_CORRECTIONS.items():
            test_text = f"Dokumen ini menggunakan istilah {wrong} dalam sistem."
            report = auditor.audit_text(test_text)
            kbbi_findings = [f for f in report.findings if f.category == "Ejaan & Kosakata KBBI"]
            
            matched = any(wrong.lower() in f.issue.lower() for f in kbbi_findings)
            if not matched:
                raise AssertionError(f"Gagal mencocokkan kata non-standar KBBI '{wrong}' -> expected suggestion '{correct}'")
            g1_assertions += 1

        # Test clean text false-positive check
        clean_text = "Sistem ini menggunakan analisis, praktik, dan risiko yang sesuai dengan objek dan subjek standar."
        clean_report = auditor.audit_text(clean_text)
        clean_kbbi_findings = [f for f in clean_report.findings if f.category == "Ejaan & Kosakata KBBI"]
        if clean_kbbi_findings:
            raise AssertionError(f"False positive pada teks baku KBBI: {[f.issue for f in clean_kbbi_findings]}")
        g1_assertions += 1

        print(f"       ✔ {len(KBBI_CORRECTIONS)}/{len(KBBI_CORRECTIONS)} KBBI errata patterns matched correctly")
        print(f"       ✔ Clean text false-positive check passed")
        print(f"       [PASS] KBBI Dictionary Matching ({g1_assertions} assertions)")
        passed_groups += 1
        total_assertions += g1_assertions
    except Exception as e:
        print(f"       [FAIL] KBBI Dictionary Matching: {e}")
        g1_passed = False

    # --------------------------------------------------------------------------
    # Group 2: Preposition Spacing Rules
    # --------------------------------------------------------------------------
    print("\n [2/5] Testing Preposition Spacing Rules...")
    g2_passed = True
    g2_assertions = 0
    try:
        for pattern, correct in PREPOSITION_FIXES:
            # Extract word from pattern
            sample_word = pattern.replace(r"\b", "")
            test_text = f"File ini disimpan {sample_word} oleh pengguna."
            report = auditor.audit_text(test_text)
            prep_findings = [f for f in report.findings if f.category == "Tata Bahasa (Kata Depan)"]
            
            matched = any(correct.lower() in f.suggestion.lower() for f in prep_findings)
            if not matched:
                raise AssertionError(f"Gagal mendeteksi kata depan conjoined '{sample_word}' -> expected '{correct}'")
            g2_assertions += 1

        # Test clean prepositions false-positive check
        clean_prep_text = "Data disimpan di mana saja, baik di sana, di sini, di atas meja, di bawah lantai, ke depan, dan ke mana pun."
        clean_report = auditor.audit_text(clean_prep_text)
        clean_prep_findings = [f for f in clean_report.findings if f.category == "Tata Bahasa (Kata Depan)"]
        if clean_prep_findings:
            raise AssertionError(f"False positive pada kata depan baku: {[f.issue for f in clean_prep_findings]}")
        g2_assertions += 1

        print(f"       ✔ {len(PREPOSITION_FIXES)}/{len(PREPOSITION_FIXES)} conjoined preposition patterns matched correctly")
        print(f"       ✔ Correctly spaced prepositions false-positive check passed")
        print(f"       [PASS] Preposition Spacing Rules ({g2_assertions} assertions)")
        passed_groups += 1
        total_assertions += g2_assertions
    except Exception as e:
        print(f"       [FAIL] Preposition Spacing Rules: {e}")
        g2_passed = False

    # --------------------------------------------------------------------------
    # Group 3: Syllable Counter & Diphthong Parsing
    # --------------------------------------------------------------------------
    print("\n [3/5] Testing Syllable Counter & Diphthong Parsing...")
    g3_passed = True
    g3_assertions = 0
    try:
        # Basic & multi-syllable cases
        cases = [
            ("", 0),
            ("dan", 1),
            ("cat", 1),
            ("saya", 2),
            ("makan", 2),
            ("buku", 2),
            ("komputer", 3),
            ("sekolah", 3),
            ("pembaca", 3),
            ("keamanan", 4),
            ("teknologi", 4),
            ("sederhana", 4),
            # Diphthongs
            ("pantai", 2),   # -ai
            ("kerbau", 2),   # -au
            ("amboi", 2),    # -oi
            ("survei", 2),   # -ei
            ("landai", 2),   # -ai
            ("harimau", 3),  # -au
            # Case sensitivity and whitespace
            ("  PANTAI  ", 2),
            ("KeAmAnAn", 4),
        ]
        for word, expected in cases:
            actual = IndonesianMorphology.count_syllables(word)
            if actual != expected:
                raise AssertionError(f"Syllable count mismatch for '{word}': expected {expected}, got {actual}")
            g3_assertions += 1

        print(f"       ✔ Basic syllable counts verified ({len(cases)} test cases)")
        print(f"       ✔ Diphthong parsing ('ai', 'au', 'oi', 'ei') verified")
        print(f"       ✔ Case-insensitivity and edge cases verified")
        print(f"       [PASS] Syllable & Diphthong Engine ({g3_assertions} assertions)")
        passed_groups += 1
        total_assertions += g3_assertions
    except Exception as e:
        print(f"       [FAIL] Syllable Counter & Diphthong Engine: {e}")
        g3_passed = False

    # --------------------------------------------------------------------------
    # Group 4: Readability Score Calculation Formula Correctness
    # --------------------------------------------------------------------------
    print("\n [4/5] Testing Readability Score Calculation Formula...")
    g4_passed = True
    g4_assertions = 0
    try:
        # Empty text test
        empty_res = IndonesianReadability.score_text("")
        if empty_res["reading_ease"] != 100.0 or empty_res["word_count"] != 0 or empty_res["sentence_count"] != 0:
            raise AssertionError(f"Empty text readability mismatch: {empty_res}")
        g4_assertions += 1

        # Known formula calculation test
        # 2 sentences, 10 words each (total 20 words), 20 syllables each (total 40 syllables)
        # ASL = 20 / 2 = 10.0
        # ASW = 40 / 20 = 2.0
        # reading_ease = 206.835 - (1.1 * 10.0) - (55.0 * 2.0) = 206.835 - 11.0 - 110.0 = 85.835 -> 85.8
        known_text = "Saya makan buku kita baca buku kita baca buku kita. Saya makan buku kita baca buku kita baca buku kita."
        known_res = IndonesianReadability.score_text(known_text)
        if known_res["word_count"] != 20:
            raise AssertionError(f"Expected 20 words, got {known_res['word_count']}")
        if known_res["sentence_count"] != 2:
            raise AssertionError(f"Expected 2 sentences, got {known_res['sentence_count']}")
        if known_res["avg_sentence_length"] != 10.0:
            raise AssertionError(f"Expected ASL 10.0, got {known_res['avg_sentence_length']}")
        if known_res["avg_syllables_per_word"] != 2.0:
            raise AssertionError(f"Expected ASW 2.0, got {known_res['avg_syllables_per_word']}")
        if known_res["reading_ease"] != 85.8:
            raise AssertionError(f"Expected reading ease 85.8, got {known_res['reading_ease']}")
        if "Sangat Mudah" not in known_res["category"]:
            raise AssertionError(f"Expected category 'Sangat Mudah...', got {known_res['category']}")
        if known_res["grade_level"] != "SD / Pemula":
            raise AssertionError(f"Expected grade 'SD / Pemula', got {known_res['grade_level']}")
        g4_assertions += 7

        # Range clamping test (extreme long text)
        extreme_hard = " ".join(["pertanggungjawaban"] * 50) + "."
        extreme_res = IndonesianReadability.score_text(extreme_hard)
        if extreme_res["reading_ease"] < 0.0 or extreme_res["reading_ease"] > 100.0:
            raise AssertionError(f"Reading ease not clamped: {extreme_res['reading_ease']}")
        g4_assertions += 1

        print(f"       ✔ Empty text handling verified")
        print(f"       ✔ Flesch-Indo calibrated formula (ASL & ASW) exact match: 85.8")
        print(f"       ✔ Grade level & Category mappings verified")
        print(f"       ✔ Score bounding [0.0 - 100.0] verified")
        print(f"       [PASS] Readability Scoring Formula ({g4_assertions} assertions)")
        passed_groups += 1
        total_assertions += g4_assertions
    except Exception as e:
        print(f"       [FAIL] Readability Scoring Formula: {e}")
        g4_passed = False

    # --------------------------------------------------------------------------
    # Group 5: AI Slop Detector Detection Patterns
    # --------------------------------------------------------------------------
    print("\n [5/5] Testing AI Slop Detector Patterns...")
    g5_passed = True
    g5_assertions = 0
    try:
        slop_test_samples = [
            # 1. AI Puffery
            ("Penerapan sistem ini merupakan bukti nyata keunggulan.", "AI Puffery", "High"),
            ("Peluncuran ini adalah tonggak sejarah penting bagi industri.", "AI Puffery", "High"),
            ("Gedung ini menjadi saksi bisu perkembangan teknologi.", "AI Puffery", "High"),
            ("Ini adalah bukti tak terbantahkan dari efisiensi.", "AI Puffery", "High"),
            # 2. Cliché AI Metaphors
            ("Dalam lanskap keamanan yang dinamis kita harus waspada.", "AI Cliché Metaphor", "High"),
            ("Kita perlu menyelami lebih dalam arsitektur sistem.", "AI Cliché Metaphor", "High"),
            ("Mari menjelajahi seluk-beluk protokol komunikasi.", "AI Cliché Metaphor", "High"),
            ("Di lanskap yang terus berkembang saat ini.", "AI Cliché Metaphor", "High"),
            # 3. Filler / Throat-Clearing
            ("Sangat penting untuk dicatat bahwa konfigurasi ini wajib.", "Filler / Throat-Clearing", "Medium"),
            ("Perlu digarisbawahi bahwa pencadangan dilakukan harian.", "Filler / Throat-Clearing", "Medium"),
            ("Tidak dapat dipungkiri bahwa kecepatan akses meningkat.", "Filler / Throat-Clearing", "Medium"),
            ("Seperti yang kita ketahui bersama, protokol sudah aktif.", "Filler / Throat-Clearing", "Medium"),
            # 4. Copula Avoidance
            ("Modul ini berfungsi sebagai sebuah jembatan antar sistem.", "Copula Avoidance", "Medium"),
            ("Firewall bertindak sebagai garda terdepan keamanan jaringan.", "Copula Avoidance", "Medium"),
            ("Aplikasi hadir untuk menawarkan kemudahan transaksi.", "Copula Avoidance", "Medium"),
            ("Server berdiri kokoh sebagai pusat data utama.", "Copula Avoidance", "Medium"),
            # 5. Em / En Dash
            ("Solusi tepat — tanpa hambatan konfigurasi.", "Em/En Dash Violation", "High"),
            ("Fitur – fitur unggulan dalam rilis ini.", "Em/En Dash Violation", "High"),
            # 6. Negative Parallelism
            ("Sistem ini tidak hanya efisien melainkan juga aman.", "Negative Parallelism", "Low"),
            ("Ini bukan sekadar alat tetapi sebuah lompatan besar.", "Negative Parallelism", "Low"),
            # 7. Conversational Rhetorical Opener
            ("Jujur saja? Kita butuh pembaruan segera.", "Theatrical Rhetorical Opener", "Medium"),
            ("Tahukah Anda bahwa enkripsi berjalan otomatis?", "Theatrical Rhetorical Opener", "Medium"),
            ("Mari kita bedah bersama fitur keamanan ini.", "Theatrical Rhetorical Opener", "Medium"),
        ]

        for sample_text, expected_cat, expected_sev in slop_test_samples:
            rep = auditor.audit_text(sample_text)
            slop_findings = [f for f in rep.findings if f.category == expected_cat and f.severity == expected_sev]
            if not slop_findings:
                raise AssertionError(f"Gagal mendeteksi AI Slop '{expected_cat}' ({expected_sev}) pada: '{sample_text}' (Ditemukan: {[f.category for f in rep.findings]})")
            g5_assertions += 1

        # Clean text check
        clean_slop_text = "Arsitektur ini menggunakan enkripsi AES-256 untuk melindungi data pengguna secara berkala."
        clean_rep = auditor.audit_text(clean_slop_text)
        clean_slop_findings = [f for f in clean_rep.findings if f.category in [rule[1] for rule in AI_SLOP_RULES]]
        if clean_slop_findings:
            raise AssertionError(f"False positive pada teks bersih tanpa slop: {[f.issue for f in clean_slop_findings]}")
        g5_assertions += 1

        print(f"       ✔ All 7 AI slop rule categories detected with exact severity ({len(slop_test_samples)} cases)")
        print(f"       ✔ Clean humanized text false-positive check passed")
        print(f"       [PASS] AI Slop Detector ({g5_assertions} assertions)")
        passed_groups += 1
        total_assertions += g5_assertions
    except Exception as e:
        print(f"       [FAIL] AI Slop Detector: {e}")
        g5_passed = False

    # --------------------------------------------------------------------------
    # Summary
    # --------------------------------------------------------------------------
    print("-" * 80)
    all_passed = (passed_groups == total_groups)
    if all_passed:
        print(f" ✅ ALL SELF-TESTS PASSED: {passed_groups}/{total_groups} test groups passed ({total_assertions} assertions verified).")
    else:
        print(f" ❌ SELF-TESTS FAILED: {total_groups - passed_groups} failed, {passed_groups} passed.")
    print("=" * 80)
    return all_passed


# ==============================================================================
# 9. CLI ARGUMENT PARSER & MAIN ENTRYPOINT
# ==============================================================================

def build_cli_parser() -> argparse.ArgumentParser:
    """Constructs command line argument parser with full help descriptions."""
    parser = argparse.ArgumentParser(
        prog="nlp_auditor.py",
        description="Indonesian NLP Auditor & Content Enhancement Engine - Zero-dependency toolkit for analyzing, scoring, and auditing Bahasa Indonesia technical & copywriting content.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Contoh Penggunaan:
  python nlp_auditor.py document.md
  python nlp_auditor.py document.md --json
  python nlp_auditor.py document.md -o report.json --json
  python nlp_auditor.py --batch "*.md"
  python nlp_auditor.py --batch "**/*.html" --json -o batch_summary.json
  python nlp_auditor.py --test
"""
    )
    parser.add_argument(
        "files",
        nargs="*",
        metavar="FILE",
        help="Path ke satu atau lebih file yang ingin diaudit (Markdown, HTML, teks)"
    )
    parser.add_argument(
        "-b", "--batch",
        type=str,
        metavar="GLOB_PATTERN",
        help="Audit beberapa file sekaligus menggunakan pola glob (contoh: '*.md', '**/*.html')"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Keluarkan hasil audit dalam format JSON"
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        metavar="FILEPATH",
        help="Simpan output laporan audit ke file yang ditentukan"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Jalankan rangkaian pengujian otomatis (self-test suite)"
    )
    return parser


def main():
    parser = build_cli_parser()
    args = parser.parse_args()

    # 1. Self-test mode
    if args.test:
        success = run_self_tests()
        sys.exit(0 if success else 1)

    auditor = IndonesianNLPAuditor()

    # 2. Batch mode via --batch flag
    if args.batch:
        glob_pattern = args.batch
        matched_files = glob.glob(glob_pattern, recursive=True)
        # Filter only files (ignore directories)
        file_paths = [p for p in matched_files if os.path.isfile(p)]
        file_paths.sort()
        
        if not file_paths:
            print(f"[WARNING] Tidak ada file yang cocok dengan pola glob: '{glob_pattern}'", file=sys.stderr)
            sys.exit(1)
            
        batch_report = auditor.audit_batch(file_paths)
        if args.json:
            output_str = json.dumps(batch_report.to_dict(), indent=2, ensure_ascii=False)
        else:
            output_str = format_batch_report(batch_report)
            
        output_result(output_str, args.output)
        return

    # 3. Positional files mode
    if args.files:
        if len(args.files) == 1:
            target_file = args.files[0]
            p = Path(target_file)
            if not p.exists():
                print(f"[ERROR] File tidak ditemukan: {target_file}", file=sys.stderr)
                sys.exit(1)
            if p.is_dir():
                print(f"[ERROR] Path '{target_file}' adalah direktori. Gunakan flag --batch untuk memproses direktori.", file=sys.stderr)
                sys.exit(1)
                
            try:
                report = auditor.audit_file(target_file)
            except Exception as e:
                print(f"[ERROR] Gagal mengaudit file '{target_file}': {e}", file=sys.stderr)
                sys.exit(1)
                
            if args.json:
                output_str = json.dumps(asdict(report), indent=2, ensure_ascii=False)
            else:
                output_str = format_audit_report(report)
                
            output_result(output_str, args.output)
        else:
            # Multiple positional files
            batch_report = auditor.audit_batch(args.files)
            if args.json:
                output_str = json.dumps(batch_report.to_dict(), indent=2, ensure_ascii=False)
            else:
                output_str = format_batch_report(batch_report)
                
            output_result(output_str, args.output)
        return

    # 4. No arguments provided: print help and exit
    parser.print_help()
    sys.exit(1)


if __name__ == "__main__":
    main()
