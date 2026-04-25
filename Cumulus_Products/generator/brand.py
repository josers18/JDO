"""
Cumulus Bank brand system — private-banking aesthetic.

Palette: deep navy (primary), champagne gold (accent), cool mist neutrals.
Display: Times-Roman (serif, classic private-banking).
Text: Helvetica (clean, tabular).
No illustrative iconography — a monogram mark and subtle ornamental rules only.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import date
from typing import Iterable, Sequence

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.doctemplate import NextPageTemplate

# ------------------------------ Core palette (shared) ------------------------------
NAVY = HexColor("#0A1F3D")          # primary
NAVY_DEEP = HexColor("#061431")     # cover base
NAVY_SOFT = HexColor("#1B3560")     # secondary
MIST = HexColor("#F4F6FA")
FOG = HexColor("#E6EBF3")
RULE = HexColor("#C7CCD6")
MUTED = HexColor("#5B6879")
TEXT = HexColor("#14213D")
TEXT_SOFT = HexColor("#3E4A61")
CLOUD = HexColor("#FFFFFF")
SUCCESS = HexColor("#2E7D5B")

# ------------------------------ Segment themes ------------------------------
@dataclass
class SegmentTheme:
    key: str               # "retail" / "wealth" / "commercial"
    label: str             # "Personal banking" / etc — used on cover tagline
    accent: colors.Color
    accent_soft: colors.Color
    accent_bg: colors.Color
    hero_base: colors.Color
    hero_top: colors.Color
    cta_kicker: str        # e.g. "Get started"
    cta_title: str         # e.g. "Open an account or speak with a banker"
    cta_lede: str          # short paragraph after the CTA title
    channel_labels: tuple[str, str, str]  # phone / online / branch labels
    branch_copy: str

RETAIL_THEME = SegmentTheme(
    key="retail",
    label="Personal banking from Cumulus Bank",
    accent=HexColor("#0E7C86"),        # teal
    accent_soft=HexColor("#7EC4CA"),
    accent_bg=HexColor("#E8F3F4"),
    hero_base=HexColor("#061431"),
    hero_top=HexColor("#1B3560"),
    cta_kicker="Get started",
    cta_title="Open an account or speak with a banker",
    cta_lede=(
        "Apply online in a few minutes, request a call back, or visit a Cumulus "
        "branch. Our team is available to review your options, confirm eligibility, "
        "and help you complete your application."
    ),
    channel_labels=("Phone", "Online", "Branch"),
    branch_copy=(
        "Visit any Cumulus branch during posted hours. "
        "Locate a branch at cumulusbank-demo-bb054209d76d.herokuapp.com/locations."
    ),
)

WEALTH_THEME = SegmentTheme(
    key="wealth",
    label="Wealth management from Cumulus Bank",
    accent=HexColor("#B08D3C"),        # champagne gold
    accent_soft=HexColor("#D7BA74"),
    accent_bg=HexColor("#F5EFE2"),
    hero_base=HexColor("#061431"),
    hero_top=HexColor("#1B3560"),
    cta_kicker="Next steps",
    cta_title="Speak with a Cumulus wealth advisor",
    cta_lede=(
        "A Cumulus advisor will review your objectives, time horizon, and tax "
        "considerations; explain the products and services available to you; and "
        "deliver a written proposal. Requests received today are typically returned "
        "within one business day."
    ),
    channel_labels=("Advisor line", "Online", "Private office"),
    branch_copy=(
        "Wealth Management offices are available by appointment. "
        "Request a meeting at cumulusbank-demo-bb054209d76d.herokuapp.com/wealth."
    ),
)

COMMERCIAL_THEME = SegmentTheme(
    key="commercial",
    label="Commercial banking from Cumulus Bank",
    accent=HexColor("#B45F1D"),        # copper
    accent_soft=HexColor("#D9A473"),
    accent_bg=HexColor("#F6EDE3"),
    hero_base=HexColor("#061431"),
    hero_top=HexColor("#22446E"),
    cta_kicker="Engage a specialist",
    cta_title="Connect with a Cumulus commercial banker",
    cta_lede=(
        "A Commercial Relationship Manager will assess your business's banking, "
        "credit, and treasury needs, coordinate supporting specialists, and return "
        "a term sheet or proposal on an expedited timeline. Existing Cumulus clients "
        "should contact their dedicated Relationship Manager directly."
    ),
    channel_labels=("Commercial desk", "Client portal", "Treasury services"),
    branch_copy=(
        "Commercial banking centers are staffed by appointment. "
        "Request a consultation at cumulusbank-demo-bb054209d76d.herokuapp.com/commercial."
    ),
)

SEGMENTS = {
    "retail": RETAIL_THEME,
    "wealth": WEALTH_THEME,
    "commercial": COMMERCIAL_THEME,
}

# module-level active theme — generator sets this before appending flowables
ACTIVE_THEME: SegmentTheme = RETAIL_THEME


def set_theme(segment: str) -> SegmentTheme:
    global ACTIVE_THEME
    ACTIVE_THEME = SEGMENTS[segment]
    return ACTIVE_THEME


def _t() -> SegmentTheme:
    return ACTIVE_THEME


# legacy aliases for code written before themes (kept for any non-generator imports)
GOLD = WEALTH_THEME.accent
GOLD_SOFT = WEALTH_THEME.accent_soft
CREAM = WEALTH_THEME.accent_bg
IVORY = HexColor("#FBFAF6")

# ------------------------------ Constants ------------------------------
EFFECTIVE_DATE = "Effective April 25, 2026"
TAGLINE = "Personal banking  ·  Lending  ·  Investments  ·  Business banking"
LEGAL_NAME = "Cumulus Bank, N.A."
NMLS = "NMLS #2026045"
MEMBER_LINE = "Member FDIC  ·  Equal Housing Lender"
CONTACT_PHONE = "954.417.2880"
CONTACT_WEB = "cumulusbank-demo-bb054209d76d.herokuapp.com"
CONTACT_WEB_URL = "https://cumulusbank-demo-bb054209d76d.herokuapp.com/"

# ------------------------------ Styles ------------------------------
def build_styles() -> dict:
    base = getSampleStyleSheet()
    s = {}
    s["Display"] = ParagraphStyle(
        "Display", parent=base["Title"],
        fontName="Times-Roman", fontSize=30, leading=34, textColor=NAVY,
        spaceAfter=4, alignment=TA_LEFT,
    )
    s["DisplayLight"] = ParagraphStyle(
        "DisplayLight", parent=base["Title"],
        fontName="Times-Italic", fontSize=14, leading=18, textColor=GOLD,
        spaceAfter=10, alignment=TA_LEFT,
    )
    s["Kicker"] = ParagraphStyle(
        "Kicker", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=8.5, leading=10, textColor=GOLD,
        alignment=TA_LEFT, spaceAfter=4,
    )
    s["KickerLight"] = ParagraphStyle(
        "KickerLight", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=8.5, leading=10,
        textColor=GOLD_SOFT, alignment=TA_LEFT,
    )
    s["H1"] = ParagraphStyle(
        "H1", parent=base["Heading1"],
        fontName="Times-Roman", fontSize=17, leading=21, textColor=NAVY,
        spaceBefore=12, spaceAfter=4, keepWithNext=1, alignment=TA_LEFT,
    )
    s["H1Kicker"] = ParagraphStyle(
        "H1Kicker", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=GOLD,
        spaceBefore=10, spaceAfter=2, keepWithNext=1,
    )
    s["H2"] = ParagraphStyle(
        "H2", parent=base["Heading2"],
        fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=NAVY,
        spaceBefore=8, spaceAfter=3, keepWithNext=1,
    )
    s["Body"] = ParagraphStyle(
        "Body", parent=base["BodyText"],
        fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=TEXT,
        spaceAfter=5, alignment=TA_JUSTIFY,
    )
    s["Lead"] = ParagraphStyle(
        "Lead", parent=base["BodyText"],
        fontName="Times-Roman", fontSize=11.5, leading=16, textColor=TEXT,
        spaceAfter=8, alignment=TA_JUSTIFY,
    )
    s["Bullet"] = ParagraphStyle(
        "Bullet", parent=s["Body"],
        leftIndent=12, bulletIndent=0, spaceAfter=2, alignment=TA_LEFT,
    )
    s["Callout"] = ParagraphStyle(
        "Callout", parent=s["Body"],
        fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=NAVY,
        alignment=TA_LEFT,
    )
    s["Small"] = ParagraphStyle(
        "Small", parent=base["Normal"],
        fontName="Helvetica", fontSize=7.5, leading=10, textColor=MUTED,
        alignment=TA_JUSTIFY,
    )
    s["TableHead"] = ParagraphStyle(
        "TableHead", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=CLOUD,
    )
    s["TableCell"] = ParagraphStyle(
        "TableCell", parent=base["Normal"],
        fontName="Helvetica", fontSize=9, leading=12, textColor=TEXT,
    )
    s["TableCellBold"] = ParagraphStyle(
        "TableCellBold", parent=s["TableCell"], fontName="Helvetica-Bold",
    )
    s["EditorialLabel"] = ParagraphStyle(
        "EditorialLabel", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=GOLD_SOFT,
        alignment=TA_LEFT,
    )
    return s


STYLES = build_styles()

# ------------------------------ Monogram ------------------------------
def draw_monogram(c: canvas.Canvas, x: float, y: float, size: float,
                  ring=GOLD, mark=GOLD, fill_bg=None):
    """Draw a circular 'C' monogram, private-banking style."""
    c.saveState()
    if fill_bg is not None:
        c.setFillColor(fill_bg)
        c.circle(x, y, size * 0.50, stroke=0, fill=1)
    # outer thin ring
    c.setStrokeColor(ring)
    c.setLineWidth(0.6)
    c.circle(x, y, size * 0.50, stroke=1, fill=0)
    # inner thicker ring
    c.setStrokeColor(ring)
    c.setLineWidth(1.6)
    c.circle(x, y, size * 0.42, stroke=1, fill=0)
    # serif "C" via arc (open on the right)
    c.setStrokeColor(mark)
    c.setLineWidth(2.2)
    # approximate open-C with an arc from 35° to 325°
    path = c.beginPath()
    import math
    r = size * 0.28
    start_deg, end_deg = 35, 325  # leaves gap on the right
    steps = 48
    first = True
    for i in range(steps + 1):
        deg = start_deg + (end_deg - start_deg) * (i / steps)
        rad = math.radians(deg)
        px = x + r * math.cos(rad)
        py = y + r * math.sin(rad)
        if first:
            path.moveTo(px, py)
            first = False
        else:
            path.lineTo(px, py)
    c.drawPath(path, stroke=1, fill=0)
    c.restoreState()


def draw_corner_ornament(c: canvas.Canvas, x: float, y: float, size: float,
                         color=GOLD, orient: str = "tl"):
    """Small L-bracket filigree for cover corners."""
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(0.6)
    if orient == "tl":
        c.line(x, y, x + size, y)
        c.line(x, y, x, y - size)
        c.line(x + size * 0.2, y + size * 0.18, x + size * 0.2, y - size * 0.2)
        c.line(x - size * 0.18, y - size * 0.2, x + size * 0.2, y - size * 0.2)
    elif orient == "br":
        c.line(x, y, x - size, y)
        c.line(x, y, x, y + size)
    c.restoreState()


# ------------------------------ Cover hero ------------------------------
def _cover_header(c: canvas.Canvas, doc):
    """Navy hero with subtle pattern, serif wordmark, accent rule per segment."""
    theme = doc.theme
    accent = theme.accent
    accent_soft = theme.accent_soft
    width, height = LETTER
    band_h = 4.25 * inch

    # solid navy field
    c.setFillColor(theme.hero_base)
    c.rect(0, height - band_h, width, band_h, stroke=0, fill=1)

    # subtle vertical gradient (lighter top, darker bottom)
    bands = 80
    top_rgb = theme.hero_top.rgb()
    bot_rgb = theme.hero_base.rgb()
    for i in range(bands):
        t = i / (bands - 1)
        r = top_rgb[0] + (bot_rgb[0] - top_rgb[0]) * t
        g = top_rgb[1] + (bot_rgb[1] - top_rgb[1]) * t
        b = top_rgb[2] + (bot_rgb[2] - top_rgb[2]) * t
        c.setFillColorRGB(r, g, b, alpha=1.0)
        c.rect(0, height - (band_h * (i + 1) / bands), width,
               band_h / bands + 0.5, stroke=0, fill=1)

    # faint diagonal engraved lines (subtle texture)
    c.saveState()
    c.setStrokeColor(colors.Color(1, 1, 1, alpha=0.035))
    c.setLineWidth(0.4)
    step = 14
    for x0 in range(-int(band_h), int(width) + int(band_h), step):
        c.line(x0, height - band_h, x0 + band_h, height)
    c.restoreState()

    # top accent hairline + bottom double-rule
    c.setFillColor(accent)
    c.rect(0, height - 0.04 * inch, width, 0.04 * inch, stroke=0, fill=1)
    c.setStrokeColor(accent)
    c.setLineWidth(0.8)
    c.line(0.6 * inch, height - band_h + 0.22 * inch,
           width - 0.6 * inch, height - band_h + 0.22 * inch)
    c.setLineWidth(0.3)
    c.line(0.6 * inch, height - band_h + 0.16 * inch,
           width - 0.6 * inch, height - band_h + 0.16 * inch)

    # monogram on right
    draw_monogram(c, width - 1.35 * inch, height - 2.20 * inch, 1.70 * inch,
                  ring=accent_soft, mark=accent_soft)

    # wordmark on left — serif
    c.setFillColor(CLOUD)
    c.setFont("Times-Roman", 22)
    c.drawString(0.60 * inch, height - 0.95 * inch, "Cumulus Bank")

    # tagline (sans, understated, segment-specific)
    c.setFillColor(HexColor("#B0B7C6"))
    c.setFont("Helvetica", 9)
    c.drawString(0.60 * inch, height - 1.15 * inch, theme.label)

    # category label — editorial (rule + uppercase)
    c.setStrokeColor(accent_soft)
    c.setLineWidth(0.5)
    c.line(0.60 * inch, height - 2.95 * inch, 0.9 * inch, height - 2.95 * inch)
    c.setFillColor(accent_soft)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(0.60 * inch, height - 3.12 * inch, doc.category.upper())

    # product code & effective date — bottom-left of hero
    c.setFillColor(HexColor("#B0B7C6"))
    c.setFont("Helvetica", 7.5)
    c.drawString(0.60 * inch, height - band_h + 0.38 * inch,
                 f"{doc.product_code}   ·   {EFFECTIVE_DATE}")


# ------------------------------ Interior page frame ------------------------------
def _header(c: canvas.Canvas, doc):
    width, height = LETTER
    accent = doc.theme.accent
    # thin navy rule across the top
    c.setFillColor(NAVY)
    c.rect(0.60 * inch, height - 0.45 * inch, width - 1.20 * inch, 0.5,
           stroke=0, fill=1)
    # accent hairline under it
    c.setFillColor(accent)
    c.rect(0.60 * inch, height - 0.50 * inch, 0.40 * inch, 0.5, stroke=0, fill=1)

    # small monogram + wordmark
    draw_monogram(c, 0.75 * inch, height - 0.75 * inch, 0.30 * inch,
                  ring=accent, mark=NAVY)
    c.setFillColor(NAVY)
    c.setFont("Times-Roman", 11)
    c.drawString(1.05 * inch, height - 0.78 * inch, "Cumulus Bank")

    # right-aligned: product + effective date
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawRightString(width - 0.60 * inch, height - 0.78 * inch,
                      f"{doc.product_name}   ·   {EFFECTIVE_DATE}")


def _footer(c: canvas.Canvas, doc):
    width, _ = LETTER
    # accent hairline
    c.setFillColor(doc.theme.accent)
    c.rect(0.60 * inch, 0.70 * inch, width - 1.20 * inch, 0.4, stroke=0, fill=1)
    # meta line
    c.setFillColor(NAVY)
    c.setFont("Helvetica", 7.5)
    c.drawString(0.60 * inch, 0.55 * inch,
                 f"{LEGAL_NAME}   ·   {NMLS}   ·   {MEMBER_LINE}")
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawRightString(width - 0.60 * inch, 0.55 * inch,
                      f"{doc.product_code}   ·   Page {doc.page}")
    # contact line
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.0)
    c.drawString(0.60 * inch, 0.40 * inch,
                 f"{CONTACT_PHONE}   ·   {CONTACT_WEB}")
    c.drawRightString(width - 0.60 * inch, 0.40 * inch,
                      "For illustrative purposes. Cumulus Bank is a fictitious institution.")


# ------------------------------ Document ------------------------------
class BrochureDoc(BaseDocTemplate):
    def __init__(self, filename, product_name, product_code, category,
                 segment: str = "retail", **kw):
        super().__init__(filename, pagesize=LETTER,
                         leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                         topMargin=0.95 * inch, bottomMargin=0.85 * inch, **kw)
        self.product_name = product_name
        self.product_code = product_code
        self.category = category
        self.segment = segment
        self.theme = SEGMENTS[segment]
        cover_frame = Frame(
            0.6 * inch, 0.85 * inch,
            LETTER[0] - 1.2 * inch, LETTER[1] - 4.40 * inch - 0.85 * inch,
            id="cover", showBoundary=0,
        )
        body_frame = Frame(
            0.6 * inch, 0.85 * inch,
            LETTER[0] - 1.2 * inch, LETTER[1] - 0.95 * inch - 0.85 * inch,
            id="body", showBoundary=0,
        )
        self.addPageTemplates([
            PageTemplate(id="Cover", frames=[cover_frame],
                         onPage=_cover_header, onPageEnd=_footer),
            PageTemplate(id="Body", frames=[body_frame],
                         onPage=_header, onPageEnd=_footer),
        ])


def switch_to_body():
    return [NextPageTemplate("Body"), PageBreak()]


# ------------------------------ Cover hero content ------------------------------
def hero_block(product_name: str, lede: str,
               summary_rows: Sequence[tuple[str, str]],
               category_label: str = "PRODUCT OVERVIEW"):
    """Below the navy hero band. Editorial title block + at-a-glance panel."""
    out = []
    out.append(Spacer(1, 0.20 * inch))

    # editorial kicker
    out.append(Paragraph(category_label, STYLES["Kicker"]))

    # serif product title
    out.append(Paragraph(product_name, STYLES["Display"]))

    # italic lede
    out.append(Paragraph(lede, STYLES["DisplayLight"]))
    out.append(Spacer(1, 0.08 * inch))

    # at-a-glance two-column summary
    accent = _t().accent
    data = []
    label_style = ParagraphStyle("EL2", parent=STYLES["EditorialLabel"],
                                 textColor=accent)
    for k, v in summary_rows:
        data.append([
            Paragraph(k.upper(), label_style),
            Paragraph(v, STYLES["TableCellBold"]),
        ])
    tbl = Table(data, colWidths=[1.85 * inch, 3.65 * inch], hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, accent),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, accent),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    out.append(tbl)
    return out


# ------------------------------ Section helpers ------------------------------
def section_header(text: str, kicker: str | None = None):
    """Editorial section header: small accent kicker + serif title."""
    accent = _t().accent
    out = []
    if kicker:
        k_style = ParagraphStyle("H1K2", parent=STYLES["H1Kicker"], textColor=accent)
        out.append(Paragraph(kicker.upper(), k_style))
    out.append(Paragraph(text, STYLES["H1"]))
    # accent rule
    rule = Table([[""]], colWidths=[1.2 * inch], rowHeights=[0.035 * inch])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), accent)]))
    out.append(rule)
    out.append(Spacer(1, 0.04 * inch))
    return KeepTogether(out)


def sub_header(text: str):
    return Paragraph(text, STYLES["H2"])


def body_para(text: str):
    return Paragraph(text, STYLES["Body"])


def lead_para(text: str):
    return Paragraph(text, STYLES["Lead"])


def bullet_list(items: Iterable[str]):
    accent_hex = "#%02X%02X%02X" % tuple(int(255 * c) for c in _t().accent.rgb())
    out = []
    for it in items:
        out.append(Paragraph(
            f"<font color='{accent_hex}'>—</font>&nbsp;&nbsp;{it}",
            STYLES["Bullet"]))
    return out


def data_table(header: Sequence[str], rows: Sequence[Sequence[str]],
               col_widths: Sequence[float] | None = None,
               zebra: bool = True) -> Table:
    accent = _t().accent
    header_cells = [Paragraph(h.upper(), STYLES["TableHead"]) for h in header]
    body_cells = [[Paragraph(str(cc), STYLES["TableCell"]) for cc in r] for r in rows]
    data = [header_cells] + body_cells
    tbl = Table(data, colWidths=col_widths, hAlign="LEFT", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), CLOUD),
        ("LINEBELOW", (0, 0), (-1, 0), 1.2, accent),
        ("LINEABOVE", (0, 0), (-1, 0), 0.25, NAVY),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    # horizontal hairlines between rows (no verticals — editorial)
    for i in range(1, len(data)):
        style.append(("LINEBELOW", (0, i), (-1, i), 0.2, RULE))
    if zebra:
        for i in range(1, len(data)):
            if i % 2 == 0:
                style.append(("BACKGROUND", (0, i), (-1, i), MIST))
    tbl.setStyle(TableStyle(style))
    return tbl


def callout_box(title: str, body: str, accent=None, bg=None):
    t = _t()
    accent = accent or t.accent
    bg = bg or t.accent_bg
    tbl = Table(
        [[Paragraph(title.upper(),
                    ParagraphStyle("CalloutKicker", parent=STYLES["EditorialLabel"],
                                   textColor=accent, fontSize=8))],
         [Paragraph(body, STYLES["Body"])]],
        colWidths=[6.9 * inch], hAlign="LEFT",
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, accent),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return tbl


def two_col(left_flowables: list, right_flowables: list,
            left_w: float = 3.35 * inch, right_w: float = 3.55 * inch,
            pad: float = 0.15 * inch) -> Table:
    tbl = Table([[left_flowables, right_flowables]],
                colWidths=[left_w, right_w], hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tbl


def feature_grid(items: Sequence[tuple[str, str]], cols: int = 2) -> Table:
    accent = _t().accent
    label_style = ParagraphStyle("FGL", parent=STYLES["EditorialLabel"],
                                 textColor=accent)
    cells = []
    for name, desc in items:
        cell = [
            Paragraph(name.upper(), label_style),
            Spacer(1, 2),
            Paragraph(name, STYLES["Callout"]),
            Paragraph(desc, STYLES["Body"]),
        ]
        cells.append(cell)
    while len(cells) % cols:
        cells.append([Paragraph("", STYLES["Body"])])
    rows = [cells[i:i + cols] for i in range(0, len(cells), cols)]
    col_w = (7.3 * inch) / cols
    tbl = Table(rows, colWidths=[col_w] * cols, hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, accent),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]
    # inner rules
    for r in range(len(rows)):
        if r < len(rows) - 1:
            style.append(("LINEBELOW", (0, r), (-1, r), 0.2, RULE))
        for cc in range(cols - 1):
            style.append(("LINEAFTER", (cc, r), (cc, r), 0.2, RULE))
    tbl.setStyle(TableStyle(style))
    return tbl


# ------------------------------ Disclosures ------------------------------
STANDARD_DEPOSIT_DISCLOSURES = [
    "Annual Percentage Yield (APY) is accurate as of the effective date shown and assumes interest remains on deposit until maturity (for time deposits) or for 365 days (for liquid accounts). A withdrawal of interest will reduce earnings.",
    "Fees may reduce earnings on the account. Variable rates may change at any time at the Bank's discretion, except where a fixed term is stated. Cumulus Bank will provide 30 days' advance written notice of adverse changes to account terms.",
    "Deposits are insured by the Federal Deposit Insurance Corporation (FDIC) up to applicable limits ($250,000 per depositor, per insured institution, for each account ownership category).",
    "Disclosures are provided pursuant to the Truth in Savings Act (Regulation DD, 12 C.F.R. Part 1030) and the Electronic Fund Transfer Act (Regulation E, 12 C.F.R. Part 1005).",
    "Funds availability is governed by Regulation CC (12 C.F.R. Part 229). Large deposits, new-account holds, and redeposited items may be subject to extended availability.",
]

STANDARD_LENDING_DISCLOSURES = [
    "Annual Percentage Rate (APR) shown is representative and based on illustrative borrower credit profiles; the rate offered to an individual applicant may differ materially. All extensions of credit are subject to application, underwriting, and verification of income, employment, assets, and collateral.",
    "Disclosures are provided pursuant to the Truth in Lending Act (Regulation Z, 12 C.F.R. Part 1026), the Equal Credit Opportunity Act (Regulation B, 12 C.F.R. Part 1002), and the Real Estate Settlement Procedures Act (Regulation X, 12 C.F.R. Part 1024) where applicable.",
    "For real-estate-secured credit, flood-zone determination, title insurance, property appraisal, and hazard insurance are required. Flood insurance is required where the property is located in a Special Flood Hazard Area identified by FEMA.",
    "Cumulus Bank, N.A. is an Equal Housing Lender. Residential mortgage products are offered through Cumulus Home Lending, a division of Cumulus Bank, N.A.",
    "NMLS Consumer Access: www.nmlsconsumeraccess.org  ·  NMLS ID 2026045.",
]

STANDARD_INVESTMENT_DISCLOSURES = [
    "Investment products and advisory services are offered through Cumulus Investment Services, LLC, a registered broker-dealer (member FINRA / SIPC) and an SEC-registered investment adviser, and an affiliate of Cumulus Bank, N.A.",
    "Securities and advisory products: NOT FDIC INSURED  ·  NOT BANK GUARANTEED  ·  MAY LOSE VALUE  ·  NOT A DEPOSIT  ·  NOT INSURED BY ANY FEDERAL GOVERNMENT AGENCY.",
    "Asset allocation and diversification do not ensure a profit or protect against loss in a declining market. Past performance is not a guarantee of future results.",
    "Before investing, carefully consider the investment objectives, risks, charges, and expenses. Request a prospectus or Form ADV Part 2A disclosure brochure from your Cumulus advisor and read it carefully before investing.",
]

STANDARD_CARD_DISCLOSURES = [
    "Annual Percentage Rates (APRs) are accurate as of the effective date and may vary with the market based on the Prime Rate as published in The Wall Street Journal on the last business day of each month.",
    "Rewards, cash-back, and travel benefits are subject to the Cumulus Rewards Program Terms, which may be amended with notice where required by applicable law.",
    "All credit products are subject to credit approval. Applicants must be at least 18 years of age (19 in AL and NE) and meet the Bank's underwriting criteria.",
    "Disclosures are provided pursuant to the Truth in Lending Act (Regulation Z, 12 C.F.R. Part 1026) and the Credit CARD Act of 2009.",
]


def disclosure_block(title: str, items: Sequence[str]) -> list:
    accent_hex = "#%02X%02X%02X" % tuple(int(255 * c) for c in _t().accent.rgb())
    out = [
        Spacer(1, 0.10 * inch),
        section_header(title, kicker="Disclosures & regulatory notices"),
    ]
    for it in items:
        out.append(Paragraph(
            f"<font color='{accent_hex}'>§</font>&nbsp;&nbsp;{it}",
            STYLES["Small"]))
    return out


def back_cover_block() -> list:
    """Segment-aware closing block."""
    theme = _t()
    accent = theme.accent
    label_style = ParagraphStyle("BCL", parent=STYLES["EditorialLabel"],
                                 textColor=accent)
    out = [
        Spacer(1, 0.18 * inch),
        section_header(theme.cta_title, kicker=theme.cta_kicker),
        Paragraph(theme.cta_lede, STYLES["Lead"]),
        Spacer(1, 0.08 * inch),
    ]

    contact = [
        [Paragraph(theme.channel_labels[0].upper(), label_style),
         Paragraph(
             f"<font name='Times-Roman' size='12'>{CONTACT_PHONE}</font><br/>"
             "Client Services, Mon–Fri 7:00 a.m. – 9:00 p.m. ET  ·  "
             "Sat 8:00 a.m. – 5:00 p.m. ET",
             STYLES["Body"])],
        [Paragraph(theme.channel_labels[1].upper(), label_style),
         Paragraph(
             f"<font name='Times-Roman' size='11'><a href='{CONTACT_WEB_URL}' "
             f"color='#0A1F3D'><u>{CONTACT_WEB}</u></a></font><br/>"
             "Apply online, review rates, or schedule an appointment.",
             STYLES["Body"])],
        [Paragraph(theme.channel_labels[2].upper(), label_style),
         Paragraph(theme.branch_copy, STYLES["Body"])],
    ]
    tbl = Table(contact, colWidths=[1.5 * inch, 5.6 * inch], hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, accent),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, accent),
        ("LINEBELOW", (0, 0), (-1, -2), 0.2, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    out.append(tbl)

    out.append(Spacer(1, 0.12 * inch))
    out.append(Paragraph(
        f"{LEGAL_NAME}  ·  {NMLS}  ·  {MEMBER_LINE}  ·  © {date.today().year} Cumulus Bank, N.A. "
        "All rights reserved. Cumulus Bank is a fictitious institution created for demonstration "
        "purposes; the disclosures, rates, and product terms contained in this brochure are "
        "illustrative only and do not represent an actual financial product or offer of credit.",
        STYLES["Small"],
    ))
    return out


# ------------------------------ Chart helpers ------------------------------
def _matplotlib_setup():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({
        "font.family": "serif",
        "font.serif": ["Times New Roman", "DejaVu Serif"],
        "font.size": 9,
        "axes.edgecolor": "#C7CCD6",
        "axes.labelcolor": "#14213D",
        "axes.titlecolor": "#0A1F3D",
        "axes.titlesize": 11,
        "axes.titleweight": "bold",
        "xtick.color": "#5B6879",
        "ytick.color": "#5B6879",
        "axes.grid": True,
        "grid.color": "#ECEFF5",
        "grid.linewidth": 0.6,
        "axes.spines.top": False,
        "axes.spines.right": False,
    })
    return plt


def chart_to_image(fig, width_in: float = 6.9, height_in: float = 2.6) -> Image:
    buf = io.BytesIO()
    fig.set_size_inches(width_in, height_in)
    fig.tight_layout()
    fig.savefig(buf, format="png", dpi=220, bbox_inches="tight", facecolor="white")
    import matplotlib.pyplot as plt
    plt.close(fig)
    buf.seek(0)
    return Image(buf, width=width_in * inch, height=height_in * inch)


def growth_curve_chart(principal: float, apy: float, years: int,
                       title: str = "Projected balance growth — interest compounded monthly"):
    plt = _matplotlib_setup()
    import numpy as np
    fig, ax = plt.subplots()
    months = np.arange(0, years * 12 + 1)
    r = apy / 100 / 12
    bal = principal * (1 + r) ** months
    ax.fill_between(months / 12, principal, bal, color="#E7DCB6", alpha=0.55)
    ax.plot(months / 12, bal, color="#0A1F3D", linewidth=1.8)
    ax.axhline(principal, color="#B08D3C", linewidth=0.6, linestyle="--")
    ax.set_title(title)
    ax.set_xlabel("Years")
    ax.set_ylabel("Projected balance (USD)")
    ax.yaxis.set_major_formatter(plt.matplotlib.ticker.FuncFormatter(
        lambda x, _: f"${x:,.0f}"))
    ax.text(0.01, 0.95,
            f"Initial deposit  ${principal:,.0f}    ·    APY  {apy:.2f}%",
            transform=ax.transAxes, fontsize=8.5, color="#0A1F3D", va="top",
            family="serif", parse_math=False)
    return chart_to_image(fig)


def bar_comparison_chart(labels, values, title, ylabel="APY (%)",
                         value_fmt=lambda v: f"{v:.2f}%"):
    plt = _matplotlib_setup()
    fig, ax = plt.subplots()
    palette = ["#0A1F3D", "#1B3560", "#B08D3C", "#D7BA74", "#5B6879", "#3E4A61"]
    bars = ax.bar(labels, values, color=palette[:len(labels)])
    ax.set_title(title)
    ax.set_ylabel(ylabel)
    for bar, v in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height(),
                value_fmt(v), ha="center", va="bottom", fontsize=8.5,
                color="#0A1F3D", fontweight="bold", family="serif")
    ax.margins(y=0.20)
    return chart_to_image(fig, height_in=2.4)


def amortization_chart(principal: float, apr: float, years: int,
                       title: str = "Principal vs. interest over the term of the loan"):
    plt = _matplotlib_setup()
    import numpy as np
    n = years * 12
    r = apr / 100 / 12
    pmt = principal * r / (1 - (1 + r) ** -n)
    balance = principal
    pp, ip = [], []
    cum_p, cum_i = 0.0, 0.0
    for _ in range(n):
        interest = balance * r
        p = pmt - interest
        balance -= p
        cum_p += p
        cum_i += interest
        pp.append(cum_p)
        ip.append(cum_i)
    fig, ax = plt.subplots()
    months = np.arange(1, n + 1) / 12
    ax.fill_between(months, 0, pp, color="#0A1F3D", alpha=0.9, label="Principal")
    ax.fill_between(months, pp, [a + b for a, b in zip(pp, ip)],
                    color="#B08D3C", alpha=0.85, label="Interest")
    ax.set_title(title)
    ax.set_xlabel("Years")
    ax.set_ylabel("Cumulative amount (USD)")
    ax.yaxis.set_major_formatter(plt.matplotlib.ticker.FuncFormatter(
        lambda x, _: f"${x:,.0f}"))
    ax.legend(loc="upper left", frameon=False)
    ax.text(0.99, 0.05,
            f"Loan  ${principal:,.0f}   ·   APR  {apr:.2f}%   ·   Term  {years} yrs   ·   Pmt  ${pmt:,.2f}/mo",
            transform=ax.transAxes, fontsize=8.5, color="#0A1F3D",
            va="bottom", ha="right", family="serif", parse_math=False)
    return chart_to_image(fig)


def donut_chart(labels, values, title, center_text=None):
    plt = _matplotlib_setup()
    fig, ax = plt.subplots()
    palette = ["#0A1F3D", "#1B3560", "#B08D3C", "#D7BA74", "#5B6879", "#3E4A61"]
    wedges, _ = ax.pie(values, colors=palette[:len(values)],
                       wedgeprops=dict(width=0.32, edgecolor="white"))
    ax.set_title(title)
    if center_text:
        ax.text(0, 0, center_text, ha="center", va="center",
                fontsize=12, color="#0A1F3D", fontweight="bold", family="serif")
    ax.legend(wedges, [f"{l}  ·  {v}%" for l, v in zip(labels, values)],
              loc="center left", bbox_to_anchor=(1.02, 0.5), frameon=False,
              fontsize=8.5)
    return chart_to_image(fig, height_in=2.8)
