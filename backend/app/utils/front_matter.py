"""Markdown front matter 解析工具。"""
from __future__ import annotations

from typing import Any

import yaml


def parse_front_matter(content: str | None) -> dict[str, Any]:
    """解析 Markdown 开头的 YAML front matter。

    兼容策略：
    - 文档无 front matter：返回 {}
    - front matter 非对象类型：返回 {}
    - YAML 解析失败：返回 {}
    """
    if not content:
        return {}

    text = content.lstrip("\ufeff")
    if not text.startswith("---"):
        return {}

    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}

    end_index = -1
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_index = i
            break

    if end_index < 0:
        return {}

    raw_header = "\n".join(lines[1:end_index]).strip()
    if not raw_header:
        return {}

    try:
        parsed = yaml.safe_load(raw_header)
    except Exception:
        return {}

    return parsed if isinstance(parsed, dict) else {}

