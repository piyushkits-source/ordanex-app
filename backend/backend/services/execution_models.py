from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ExecutionMessage:
    level: str
    code: str
    text: str


@dataclass
class ExecutionContext:
    client_id: str
    partner_id: str
    document_type: str = "PO"
    input_format: str = "PDF"
    source_payload: dict[str, Any] = field(default_factory=dict)
    working_payload: dict[str, Any] = field(default_factory=dict)
    mapped_payload: dict[str, Any] = field(default_factory=dict)
    output_payload: dict[str, Any] = field(default_factory=dict)
    messages: list[ExecutionMessage] = field(default_factory=list)
    derived_codes: dict[str, Any] = field(default_factory=dict)

    def info(self, code: str, text: str) -> None:
        self.messages.append(ExecutionMessage(level="INFO", code=code, text=text))

    def warn(self, code: str, text: str) -> None:
        self.messages.append(ExecutionMessage(level="WARN", code=code, text=text))

    def error(self, code: str, text: str) -> None:
        self.messages.append(ExecutionMessage(level="ERROR", code=code, text=text))