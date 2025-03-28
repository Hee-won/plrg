import os
import sys
import json

def process_downstream_infos(downstream_dir, code_injection_dir, output_dir):
    for filename in os.listdir(downstream_dir):
        if filename.endswith("dependencies.json"):
            base = filename[:-len("_dependencies.json")]
            if "_" not in base:
                print(f"[스킵] 파일 이름 형식 오류: {filename}")
                continue

            upstream_name, upstream_version = base.rsplit("_", 1)
            print(f"\n[처리 중] Upstream: {upstream_name}@{upstream_version}")

            downstream_file_path = os.path.join(downstream_dir, filename)
            try:
                with open(downstream_file_path, 'r', encoding='utf-8') as f:
                    downstream_data = json.load(f)
            except Exception as e:
                print(f"[오류] {downstream_file_path} 파일 읽기 실패: {e}")
                continue

            downstreams = []
            dependents = downstream_data.get("dependents", [])
            for dep in dependents:
                dep_pkg = dep.get("package", "").strip()
                dep_ver = dep.get("version", "").strip()
                if dep_pkg and dep_ver:
                    downstreams.append(f"{dep_pkg}@{dep_ver}")
            if not downstreams:
                print(f"[알림] {upstream_name}@{upstream_version}은 downstream 정보가 없습니다.")

            # code-injection 디렉토리 내에서 upstream_name으로 시작하는 폴더 찾기
            matched_id = ""
            matched_sink = ""
            for folder in os.listdir(code_injection_dir):
                if folder.startswith(upstream_name):
                    package_json_path = os.path.join(code_injection_dir, folder, "package.json")
                    if os.path.isfile(package_json_path):
                        try:
                            with open(package_json_path, 'r', encoding='utf-8') as pf:
                                package_data = json.load(pf)
                                matched_id = package_data.get("id", "")
                                matched_sink = package_data.get("sink", "")
                                break  # 첫 번째 일치 항목 사용
                        except Exception as e:
                            print(f"[오류] {package_json_path} 읽기 실패: {e}")
                    else:
                        print(f"[오류] package.json 없음: {package_json_path}")

            # 최종 결과 생성
            output_data = {
                "id": matched_id,
                "upstream": f"{upstream_name}@{upstream_version}",
                "keymethod": "",
                "keystring": "",
                "location": matched_sink,
                "downstreams": downstreams
            }

            if not os.path.exists(output_dir):
                os.makedirs(output_dir)
            output_filename = f"{upstream_name}_{upstream_version}_output.json"
            output_file_path = os.path.join(output_dir, output_filename)
            try:
                with open(output_file_path, 'w', encoding='utf-8') as out_f:
                    json.dump(output_data, out_f, indent=4, ensure_ascii=False)
                print(f"[저장됨] {output_file_path}")
            except Exception as e:
                print(f"[오류] 결과 저장 실패: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("사용법: python3 this_script.py <downstream_infos 폴더 경로> <code-injection 폴더 경로> <output 폴더 경로>")
        sys.exit(1)

    downstream_dir = sys.argv[1]
    code_injection_dir = sys.argv[2]
    output_dir = sys.argv[3]

    process_downstream_infos(downstream_dir, code_injection_dir, output_dir)
