#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/.."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

INPUT_JSON="data/articles.json"
OUTPUT_JSON="data/translations-free.json"
LINES_FILE="$TMP_DIR/articles.tsv"
JSONL_FILE="$TMP_DIR/translations.jsonl"

translate_text() {
  local text="$1"
  if [[ -z "$text" ]]; then
    printf ""
    return
  fi

  local encoded
  encoded="$(jq -rn --arg x "$text" '$x|@uri')"
  curl -L --silent --show-error --max-time 20 \
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encoded}" |
    jq -r '.[0] | map(.[0]) | join("")'
}

infer_entities_json() {
  local title_lower="${(L)1}"
  local -a entities=()

  case "$title_lower" in *toyota*) entities+=("丰田 | Toyota") ;; esac
  case "$title_lower" in *lexus*) entities+=("雷克萨斯 | Lexus") ;; esac
  case "$title_lower" in *nissan*) entities+=("日产 | Nissan") ;; esac
  case "$title_lower" in *honda*) entities+=("本田 | Honda") ;; esac
  case "$title_lower" in *mazda*) entities+=("马自达 | Mazda") ;; esac
  case "$title_lower" in *subaru*) entities+=("斯巴鲁 | Subaru") ;; esac
  case "$title_lower" in *suzuki*) entities+=("铃木 | Suzuki") ;; esac
  case "$title_lower" in *yamaha*) entities+=("雅马哈 | Yamaha") ;; esac
  case "$title_lower" in *kawasaki*) entities+=("川崎 | Kawasaki") ;; esac
  case "$title_lower" in *harley*) entities+=("哈雷戴维森 | Harley-Davidson") ;; esac
  case "$title_lower" in *bmw*) entities+=("宝马 | BMW") ;; esac
  case "$title_lower" in *mercedes*) entities+=("梅赛德斯-奔驰 | Mercedes-Benz") ;; esac
  case "$title_lower" in *audi*) entities+=("奥迪 | Audi") ;; esac
  case "$title_lower" in *porsche*) entities+=("保时捷 | Porsche") ;; esac
  case "$title_lower" in *volkswagen*) entities+=("大众 | Volkswagen") ;; esac
  case "$title_lower" in *jeep*) entities+=("Jeep | Jeep") ;; esac
  case "$title_lower" in *tesla*) entities+=("特斯拉 | Tesla") ;; esac
  case "$title_lower" in *rivian*) entities+=("Rivian | Rivian") ;; esac
  case "$title_lower" in *kia*) entities+=("起亚 | Kia") ;; esac
  case "$title_lower" in *hyundai*) entities+=("现代 | Hyundai") ;; esac
  case "$title_lower" in *byd*) entities+=("比亚迪 | BYD") ;; esac
  case "$title_lower" in *vespa*) entities+=("Vespa | Vespa") ;; esac
  case "$title_lower" in *"land rover"*) entities+=("路虎 | Land Rover") ;; esac
  case "$title_lower" in *ferrari*) entities+=("法拉利 | Ferrari") ;; esac

  if (( ${#entities[@]} == 0 )); then
    printf '[]'
    return
  fi

  printf '%s\n' "${entities[@]}" | jq -R . | jq -s 'unique'
}

jq -r 'to_entries[] | [.key, .value.url, .value.title_en] | @tsv' "$INPUT_JSON" > "$LINES_FILE"

total="$(wc -l < "$LINES_FILE" | tr -d ' ')"
count=0
> "$JSONL_FILE"

while IFS=$'\t' read -r index url title; do
  count=$((count + 1))
  title_zh="$(translate_text "$title" || true)"
  entities_json="$(infer_entities_json "$title")"

  jq -nc \
    --arg key "$url" \
    --arg title_zh "$title_zh" \
    --arg translated_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --argjson entities "$entities_json" \
    '{
      key: $key,
      value: {
        title_zh: $title_zh,
        summary_short: "",
        summary_long: "",
        entities: $entities,
        translation_source: "google-translate-free-web-title-only",
        translated_at: $translated_at
      }
    }' >> "$JSONL_FILE"

  printf '✅ [%s/%s] %s\n' "$count" "$total" "$url"
done < "$LINES_FILE"

jq -s 'map({(.key): .value}) | add' "$JSONL_FILE" > "$OUTPUT_JSON"
printf '🎉 写入 %s\n' "$OUTPUT_JSON"
