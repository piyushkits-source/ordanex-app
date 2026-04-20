from __future__ import annotations

import json
from typing import Any


class LayoutClusteringService:

    # -----------------------------
    # SIMILARITY ENGINE
    # -----------------------------
    def calculate_similarity(self, f1: dict, f2: dict) -> float:
        score = 0
        total = 0

        # Header keys match
        k1 = set(f1.get("header_keys", []))
        k2 = set(f2.get("header_keys", []))

        if k1 or k2:
            total += 30
            overlap = len(k1.intersection(k2))
            union = len(k1.union(k2))
            if union > 0:
                score += (overlap / union) * 30

        # Item fields match
        i1 = set(f1.get("item_fields", []))
        i2 = set(f2.get("item_fields", []))

        if i1 or i2:
            total += 30
            overlap = len(i1.intersection(i2))
            union = len(i1.union(i2))
            if union > 0:
                score += (overlap / union) * 30

        # Line count similarity
        l1 = f1.get("line_count", 0)
        l2 = f2.get("line_count", 0)

        if l1 and l2:
            total += 20
            diff = abs(l1 - l2) / max(l1, l2)
            score += (1 - diff) * 20

        # Text hash (strong signal)
        if f1.get("text_hash") == f2.get("text_hash"):
            score += 20
            total += 20

        return round((score / total) * 100, 2) if total else 0

    # -----------------------------
    # FIND BEST MATCH
    # -----------------------------
    def find_best_layout(self, current_fp: dict, existing_profiles: list) -> tuple[Any, float]:
        best_score = 0
        best_profile = None

        for profile in existing_profiles:
            existing_fp = profile.fingerprint_json or {}
            sim = self.calculate_similarity(current_fp, existing_fp)

            if sim > best_score:
                best_score = sim
                best_profile = profile

        return best_profile, best_score

    # -----------------------------
    # DECISION ENGINE
    # -----------------------------
    def classify_layout(self, similarity: float) -> str:
        if similarity >= 90:
            return "EXACT_MATCH"
        elif similarity >= 75:
            return "CLOSE_MATCH"
        elif similarity >= 50:
            return "PARTIAL_MATCH"
        else:
            return "NEW_LAYOUT"


layout_clustering_service = LayoutClusteringService()