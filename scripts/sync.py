#!/usr/bin/env python3
"""
同步脚本：依据 sync-map.json 将 mem-course 中的最新交互式讲义同步至本仓库。
用法：
  python3 scripts/sync.py         # 同步更新有变化的文件
  python3 scripts/sync.py --check # 仅检查是否有更新，不执行写入
"""

import os
import sys
import json
import shutil
import hashlib

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP_FILE = os.path.join(REPO_ROOT, "sync-map.json")

def get_file_hash(path):
    if not os.path.exists(path):
        return None
    h = hashlib.md5()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    check_only = "--check" in sys.argv
    if not os.path.exists(MAP_FILE):
        print(f"错误：未找到配置文件 {MAP_FILE}")
        sys.exit(1)

    with open(MAP_FILE, "r", encoding="utf-8") as f:
        config = json.load(f)

    source_root = config.get("source_root", "")
    mappings = config.get("mappings", [])

    print(f"源目录: {source_root}")
    print(f"仓库根目录: {REPO_ROOT}\n")

    changed_count = 0
    missing_count = 0

    for item in mappings:
        src = os.path.join(source_root, item["source"])
        tgt = os.path.join(REPO_ROOT, item["target"])
        title = item.get("title", item["target"])

        if not os.path.exists(src):
            print(f"[缺失源文件] {title}\n  -> {src}")
            missing_count += 1
            continue

        src_hash = get_file_hash(src)
        tgt_hash = get_file_hash(tgt)

        if src_hash != tgt_hash:
            changed_count += 1
            if check_only:
                print(f"[待更新] {title} ({item['course']})")
                print(f"  源: {src}")
                print(f"  目标: {tgt}")
            else:
                os.makedirs(os.path.dirname(tgt), exist_ok=True)
                shutil.copy2(src, tgt)
                print(f"[已更新] {title} -> {item['target']}")
        else:
            print(f"[一致] {title}")

    print("\n" + "=" * 40)
    if check_only:
        print(f"检查完成：{changed_count} 个文件待更新，{missing_count} 个源文件缺失。")
    else:
        print(f"同步完成：已更新 {changed_count} 个文件，{missing_count} 个源文件缺失。")

if __name__ == "__main__":
    main()
