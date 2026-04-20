from __future__ import annotations

from math import sqrt
from typing import Any


class VisualLayoutClusteringService:
    """
    Compares layout geometry using bbox patterns.
    ERP-agnostic and document-type agnostic.
    """

    def normalize_bbox(self, bbox: dict[str, Any]) -> dict[str, float]:
        return {
            "x": float(bbox.get("x", 0) or 0),
            "y": float(bbox.get("y", 0) or 0),
            "width": float(bbox.get("width", 0) or 0),
            "height": float(bbox.get("height", 0) or 0),
            "page": float(bbox.get("page", 1) or 1),
        }

    def build_visual_signature(self, mappings: list[dict[str, Any]]) -> dict[str, Any]:
        """
        Build a stable geometry signature from bbox mappings.
        """
        if not mappings:
            return {
                "field_count": 0,
                "pages": [],
                "fields": [],
                "centroids": {},
                "avg_width": 0,
                "avg_height": 0,
            }

        normalized = []
        widths = []
        heights = []
        pages = set()

        for m in mappings:
            key = m.get("key")
            bbox = m.get("bbox")
            if not key or not bbox:
                continue

            b = self.normalize_bbox(bbox)
            pages.add(int(b["page"]))
            widths.append(b["width"])
            heights.append(b["height"])

            normalized.append(
                {
                    "key": key,
                    "page": int(b["page"]),
                    "x": round(b["x"], 2),
                    "y": round(b["y"], 2),
                    "width": round(b["width"], 2),
                    "height": round(b["height"], 2),
                    "cx": round(b["x"] + b["width"] / 2, 2),
                    "cy": round(b["y"] + b["height"] / 2, 2),
                }
            )

        centroids = {f["key"]: {"cx": f["cx"], "cy": f["cy"], "page": f["page"]} for f in normalized}

        return {
            "field_count": len(normalized),
            "pages": sorted(list(pages)),
            "fields": sorted(normalized, key=lambda x: (x["page"], x["y"], x["x"])),
            "centroids": centroids,
            "avg_width": round(sum(widths) / len(widths), 2) if widths else 0,
            "avg_height": round(sum(heights) / len(heights), 2) if heights else 0,
        }

    def _distance(self, a: dict[str, float], b: dict[str, float]) -> float:
        if int(a.get("page", 1)) != int(b.get("page", 1)):
            return 999999
        return sqrt((a["cx"] - b["cx"]) ** 2 + (a["cy"] - b["cy"]) ** 2)

    def compare_visual_signatures(self, s1: dict[str, Any], s2: dict[str, Any]) -> float:
        """
        Returns 0..100 similarity.
        """
        if not s1 or not s2:
            return 0.0

        c1 = s1.get("centroids", {}) or {}
        c2 = s2.get("centroids", {}) or {}

        if not c1 or not c2:
            return 0.0

        keys1 = set(c1.keys())
        keys2 = set(c2.keys())

        union = keys1.union(keys2)
        common = keys1.intersection(keys2)

        if not union:
            return 0.0

        key_overlap_score = (len(common) / len(union)) * 40.0

        if not common:
            return round(key_overlap_score, 2)

        # Geometry score
        distances = []
        for key in common:
            distances.append(self._distance(c1[key], c2[key]))

        avg_dist = sum(distances) / len(distances) if distances else 999999

        # Tune this threshold later based on your PDFs
        geometry_score = max(0.0, 40.0 - min(avg_dist, 40.0))

        # Page pattern score
        pages1 = set(s1.get("pages", []))
        pages2 = set(s2.get("pages", []))
        page_union = pages1.union(pages2)
        page_common = pages1.intersection(pages2)
        page_score = ((len(page_common) / len(page_union)) * 10.0) if page_union else 0.0

        # Shape score
        w1 = float(s1.get("avg_width", 0) or 0)
        w2 = float(s2.get("avg_width", 0) or 0)
        h1 = float(s1.get("avg_height", 0) or 0)
        h2 = float(s2.get("avg_height", 0) or 0)

        width_ratio = min(w1, w2) / max(w1, w2) if max(w1, w2) > 0 else 0
        height_ratio = min(h1, h2) / max(h1, h2) if max(h1, h2) > 0 else 0
        shape_score = ((width_ratio + height_ratio) / 2.0) * 10.0

        total = key_overlap_score + geometry_score + page_score + shape_score
        return round(min(total, 100.0), 2)

    def classify_visual_match(self, score: float) -> str:
        if score >= 92:
            return "VISUAL_EXACT_MATCH"
        if score >= 78:
            return "VISUAL_CLOSE_MATCH"
        if score >= 55:
            return "VISUAL_PARTIAL_MATCH"
        return "VISUAL_NEW_LAYOUT"


visual_layout_clustering_service = VisualLayoutClusteringService()