"""
Customer-document generation primitives.

This project mirrors the Cumulus_Products generation architecture, but the
documents are intentionally content-heavy operating briefs rather than branded
brochures. This module owns the neutral page shell, reusable flowables, tables,
scorecards, and disclosure blocks.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

NAVY = HexColor("#0A1F3D")
NAVY_DEEP = HexColor("#061431")
NAVY_SOFT = HexColor("#1B3560")
MIST = HexColor("#F4F6FA")
FOG = HexColor("#E6EBF3")
RULE = HexColor("#C7CCD6")
MUTED = HexColor("#5B6879")
TEXT = HexColor("#14213D")
CLOUD = HexColor("#FFFFFF")
IVORY = HexColor("#FBFAF6")


@dataclass(frozen=True)
class SegmentTheme:
    key: str
    label: str
    accent: colors.Color
    accent_soft: colors.Color
    accent_bg: colors.Color
    cta_title: str
    cta_body: str


SEGMENTS = {
    "retail": SegmentTheme(
        key="retail",
        label="Retail customer document",
        accent=HexColor("#0E7C86"),
        accent_soft=HexColor("#7EC4CA"),
        accent_bg=HexColor("#E8F3F4"),
        cta_title="Coordinate the next customer conversation",
        cta_body=(
            "Use this document as a banker-ready brief for relationship planning, "
            "service follow-up, and customer education inside the Cumulus demo org."
        ),
    ),
    "wealth": SegmentTheme(
        key="wealth",
        label="Wealth customer document",
        accent=HexColor("#B08D3C"),
        accent_soft=HexColor("#D7BA74"),
        accent_bg=HexColor("#F5EFE2"),
        cta_title="Review with the advisory team",
        cta_body=(
            "Use this document to frame goals, planning gaps, household context, "
            "and advisor next steps for the Cumulus wealth relationship."
        ),
    ),
    "commercial": SegmentTheme(
        key="commercial",
        label="Commercial customer document",
        accent=HexColor("#B45F1D"),
        accent_soft=HexColor("#D9A473"),
        accent_bg=HexColor("#F6EDE3"),
        cta_title="Align the relationship team",
        cta_body=(
            "Use this document to coordinate treasury, lending, service, and "
            "relationship-management actions for business customers."
        ),
    ),
}

ACTIVE_THEME = SEGMENTS["retail"]

LEGAL_NAME = "Cumulus Bank, N.A."
MEMBER_LINE = "Member FDIC. Equal Housing Lender."
CONTACT_PHONE = "954.417.2880"
CONTACT_WEB = "cumulusbank-demo-bb054209d76d.herokuapp.com"
DEMO_LINE = "Demo asset. Fictitious customer data. Not for production customer communications."


def set_theme(segment: str) -> SegmentTheme:
    global ACTIVE_THEME
    ACTIVE_THEME = SEGMENTS[segment]
    return ACTIVE_THEME


def theme() -> SegmentTheme:
    return ACTIVE_THEME


def clean(text: object) -> str:
    return escape(str(text))


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "CoverKicker": ParagraphStyle(
            "CoverKicker",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            textColor=theme().accent,
            alignment=TA_LEFT,
            uppercase=True,
        ),
        "CoverTitle": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName="Times-Roman",
            fontSize=25,
            leading=29,
            textColor=NAVY,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "CoverLead": ParagraphStyle(
            "CoverLead",
            parent=base["Normal"],
            fontName="Times-Italic",
            fontSize=11.5,
            leading=16,
            textColor=TEXT,
            alignment=TA_LEFT,
        ),
        "MetaLabel": ParagraphStyle(
            "MetaLabel",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.2,
            leading=9,
            textColor=MUTED,
            alignment=TA_LEFT,
        ),
        "MetaValue": ParagraphStyle(
            "MetaValue",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.4,
            leading=10.5,
            textColor=TEXT,
            alignment=TA_LEFT,
        ),
        "Kicker": ParagraphStyle(
            "Kicker",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.8,
            leading=10,
            textColor=theme().accent,
            alignment=TA_LEFT,
            spaceBefore=8,
            spaceAfter=2,
        ),
        "H1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Times-Roman",
            fontSize=17,
            leading=21,
            textColor=NAVY,
            alignment=TA_LEFT,
            spaceAfter=5,
            keepWithNext=1,
        ),
        "H2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            textColor=NAVY,
            alignment=TA_LEFT,
            spaceBefore=5,
            spaceAfter=3,
        ),
        "H3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=9.3,
            leading=11.6,
            textColor=TEXT,
            alignment=TA_LEFT,
            spaceBefore=4,
            spaceAfter=2,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=13.2,
            textColor=TEXT,
            alignment=TA_JUSTIFY,
            spaceAfter=5,
        ),
        "Lead": ParagraphStyle(
            "Lead",
            parent=base["BodyText"],
            fontName="Times-Roman",
            fontSize=11.2,
            leading=15.5,
            textColor=TEXT,
            alignment=TA_JUSTIFY,
            spaceAfter=8,
        ),
        "Small": ParagraphStyle(
            "Small",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.2,
            leading=9.4,
            textColor=MUTED,
            alignment=TA_JUSTIFY,
        ),
        "Tight": ParagraphStyle(
            "Tight",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.6,
            leading=11.4,
            textColor=TEXT,
            alignment=TA_LEFT,
            spaceAfter=3,
        ),
        "Cell": ParagraphStyle(
            "Cell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.4,
            leading=11,
            textColor=TEXT,
            alignment=TA_LEFT,
        ),
        "CellBold": ParagraphStyle(
            "CellBold",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.4,
            leading=11,
            textColor=TEXT,
            alignment=TA_LEFT,
        ),
        "HeadCell": ParagraphStyle(
            "HeadCell",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.2,
            leading=10.5,
            textColor=CLOUD,
            alignment=TA_LEFT,
        ),
        "FeatureTitle": ParagraphStyle(
            "FeatureTitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=NAVY,
            alignment=TA_LEFT,
            spaceAfter=2,
        ),
        "FeatureBody": ParagraphStyle(
            "FeatureBody",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.1,
            leading=10.5,
            textColor=TEXT,
            alignment=TA_LEFT,
        ),
        "BackTitle": ParagraphStyle(
            "BackTitle",
            parent=base["Heading1"],
            fontName="Times-Roman",
            fontSize=20,
            leading=24,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=5,
        ),
        "BackBody": ParagraphStyle(
            "BackBody",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=13,
            textColor=TEXT,
            alignment=TA_CENTER,
        ),
    }


class AccentRule(Flowable):
    def __init__(self, height: float = 0.08 * inch):
        super().__init__()
        self.height = height

    def wrap(self, avail_width: float, avail_height: float) -> tuple[float, float]:
        self.width = avail_width
        return avail_width, self.height

    def draw(self) -> None:
        self.canv.setFillColor(theme().accent)
        self.canv.rect(0, 0, self.width, self.height, stroke=0, fill=1)


class MetricBars(Flowable):
    def __init__(self, metrics: Sequence[tuple[str, int, str]]):
        super().__init__()
        self.metrics = metrics
        self.height = max(0.75 * inch, 0.34 * inch * len(metrics))

    def wrap(self, avail_width: float, avail_height: float) -> tuple[float, float]:
        self.width = avail_width
        return avail_width, self.height

    def draw(self) -> None:
        c = self.canv
        y = self.height - 0.18 * inch
        label_width = 1.85 * inch
        bar_width = self.width - label_width - 0.75 * inch
        for label, score, note in self.metrics:
            c.setFillColor(TEXT)
            c.setFont("Helvetica-Bold", 7.8)
            c.drawString(0, y, str(label)[:28])
            c.setFillColor(FOG)
            c.roundRect(label_width, y - 3, bar_width, 8, 2, stroke=0, fill=1)
            c.setFillColor(theme().accent)
            c.roundRect(label_width, y - 3, bar_width * max(0, min(score, 100)) / 100, 8, 2, stroke=0, fill=1)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 7.3)
            c.drawRightString(self.width, y - 1, f"{score}% - {note}")
            y -= 0.32 * inch


class CustomerDocumentDoc(BaseDocTemplate):
    def __init__(self, filename: str, *, title: str, document_code: str, segment: str):
        set_theme(segment)
        self.title = title
        self.document_code = document_code
        self.segment = segment
        margin_x = 0.68 * inch
        margin_bottom = 0.68 * inch
        frame = Frame(
            margin_x,
            margin_bottom,
            LETTER[0] - (margin_x * 2),
            LETTER[1] - margin_bottom - 0.88 * inch,
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
            id="body",
        )
        super().__init__(
            filename,
            pagesize=LETTER,
            leftMargin=margin_x,
            rightMargin=margin_x,
            topMargin=0.84 * inch,
            bottomMargin=margin_bottom,
            title=title,
            author=LEGAL_NAME,
            subject="Cumulus Bank customer document demo asset",
        )
        self.addPageTemplates([PageTemplate(id="body", frames=[frame], onPage=self._page_shell)])

    def _page_shell(self, canvas: Canvas, doc: BaseDocTemplate) -> None:
        width, height = LETTER
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 8.5)
        canvas.drawString(self.leftMargin, height - 0.46 * inch, "CUMULUS BANK")
        canvas.setFillColor(theme().accent)
        canvas.rect(self.leftMargin, height - 0.55 * inch, 0.8 * inch, 0.03 * inch, stroke=0, fill=1)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7.2)
        canvas.drawRightString(width - self.rightMargin, height - 0.46 * inch, f"{self.document_code} | Page {doc.page}")
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.4)
        canvas.line(self.leftMargin, 0.48 * inch, width - self.rightMargin, 0.48 * inch)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 6.8)
        canvas.drawString(self.leftMargin, 0.31 * inch, f"{LEGAL_NAME} | {MEMBER_LINE}")
        canvas.drawRightString(width - self.rightMargin, 0.31 * inch, DEMO_LINE)
        canvas.restoreState()


def para(text: object, style_name: str = "Body") -> Paragraph:
    return Paragraph(clean(text), styles()[style_name])


def rich(text: str, style_name: str = "Body") -> Paragraph:
    return Paragraph(text, styles()[style_name])


def section_header(title: str, kicker: str) -> KeepTogether:
    return KeepTogether([para(kicker.upper(), "Kicker"), para(title, "H1"), AccentRule(), Spacer(1, 0.08 * inch)])


def subsection(title: str) -> Paragraph:
    return para(title, "H2")


def callout(title: str, body: str) -> Table:
    s = styles()
    table = Table(
        [[Paragraph(clean(title), s["CellBold"]), Paragraph(clean(body), s["Cell"])]],
        colWidths=[1.45 * inch, 4.95 * inch],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), theme().accent_bg),
                ("BOX", (0, 0), (-1, -1), 0.5, RULE),
                ("LINEBEFORE", (0, 0), (0, -1), 3.0, theme().accent),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def cover_block(*, title: str, lede: str, rows: Sequence[tuple[str, str]], document_code: str) -> list:
    s = styles()
    meta_rows = [
        [Paragraph(clean(label).upper(), s["MetaLabel"]), Paragraph(clean(value), s["MetaValue"])]
        for label, value in rows
    ]
    meta = Table(meta_rows, colWidths=[1.05 * inch, 2.15 * inch])
    meta.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), IVORY),
                ("BOX", (0, 0), (-1, -1), 0.6, RULE),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    panel = Table(
        [
            [
                Paragraph(clean(theme().label.upper()), s["CoverKicker"]),
                Paragraph(clean(document_code), s["CoverKicker"]),
            ],
            [Paragraph(clean(title), s["CoverTitle"]), ""],
            [Paragraph(clean(lede), s["CoverLead"]), ""],
        ],
        colWidths=[4.4 * inch, 2.0 * inch],
        rowHeights=[0.28 * inch, 0.78 * inch, 0.82 * inch],
    )
    panel.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), MIST),
                ("SPAN", (0, 1), (1, 1)),
                ("SPAN", (0, 2), (1, 2)),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 18),
                ("RIGHTPADDING", (0, 0), (-1, -1), 18),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ("LINEBELOW", (0, 0), (-1, 0), 1.1, theme().accent),
                ("BOX", (0, 0), (-1, -1), 0.6, RULE),
            ]
        )
    )
    return [panel, Spacer(1, 0.18 * inch), meta, Spacer(1, 0.22 * inch)]


def data_table(headers: Sequence[str], rows: Sequence[Sequence[object]], col_widths: Sequence[float] | None = None) -> Table:
    s = styles()
    data = [[Paragraph(clean(h), s["HeadCell"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(clean(cell), s["Cell"]) for cell in row])
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("BACKGROUND", (0, 1), (-1, -1), CLOUD),
                ("GRID", (0, 0), (-1, -1), 0.35, RULE),
                ("LINEBELOW", (0, 0), (-1, 0), 1.0, theme().accent),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    for row_idx in range(2, len(data), 2):
        table.setStyle(TableStyle([("BACKGROUND", (0, row_idx), (-1, row_idx), MIST)]))
    return table


def feature_grid(items: Sequence[tuple[str, str]], columns: int = 2) -> Table:
    s = styles()
    cells = []
    row = []
    for title, body in items:
        cell = [
            Paragraph(clean(title), s["FeatureTitle"]),
            Paragraph(clean(body), s["FeatureBody"]),
        ]
        row.append(cell)
        if len(row) == columns:
            cells.append(row)
            row = []
    if row:
        while len(row) < columns:
            row.append("")
        cells.append(row)
    table = Table(cells, colWidths=[3.08 * inch] * columns)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), theme().accent_bg),
                ("BOX", (0, 0), (-1, -1), 0.5, RULE),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def bullet_block(items: Sequence[str]) -> list[Paragraph]:
    return [rich(f"&bull; {clean(item)}", "Body") for item in items]


def metrics_block(metrics: Sequence[tuple[str, int, str]]) -> list:
    return [MetricBars(metrics), Spacer(1, 0.1 * inch)]


def disclosure_block(disclosures: Sequence[str]) -> list:
    story = [section_header("Disclosures and controls", "Demo guardrails")]
    story.extend(para(item, "Small") for item in disclosures)
    story.append(para(DEMO_LINE, "Small"))
    return story


def back_cover_block(owner_role: str) -> list:
    s = styles()
    panel = Table(
        [
            [Paragraph(clean(theme().cta_title), s["BackTitle"])],
            [Paragraph(clean(theme().cta_body), s["BackBody"])],
            [Paragraph(clean(f"Primary owner: {owner_role} | {CONTACT_PHONE} | {CONTACT_WEB}"), s["BackBody"])],
        ],
        colWidths=[6.4 * inch],
    )
    panel.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), theme().accent_bg),
                ("BOX", (0, 0), (-1, -1), 0.7, theme().accent),
                ("LEFTPADDING", (0, 0), (-1, -1), 22),
                ("RIGHTPADDING", (0, 0), (-1, -1), 22),
                ("TOPPADDING", (0, 0), (-1, -1), 16),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
            ]
        )
    )
    return [PageBreak(), Spacer(1, 1.4 * inch), panel]
