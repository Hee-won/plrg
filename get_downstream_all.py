import os
import subprocess
import json
import re
import sys

def parse_folder_name(folder_name):
    """pkg-name_pkg-version 형식에서 이름과 버전 분리"""
    if '_' not in folder_name:
        return None, None
    parts = folder_name.rsplit('_', 1)
    return parts[0], parts[1]

def get_all_versions(pkg_name):
    """npm view 명령어를 통해 모든 버전 가져오기"""
    try:
        result = subprocess.run(['npm', 'view', pkg_name, 'versions', '--json'], capture_output=True, text=True, check=True)
        versions = json.loads(result.stdout)
        return versions if isinstance(versions, list) else []
    except subprocess.CalledProcessError as e:
        print(f"[에러] {pkg_name} 버전 조회 실패: {e}")
        return []

def filter_versions(versions, base_version):
    """base_version과 major 동일, minor <= base minor, 그리고 patch 조건도 반영"""
    base_match = re.match(r'^(\d+)\.(\d+)\.(\d+)', base_version)
    if not base_match:
        return []
    base_major, base_minor, base_patch = map(int, base_match.groups())

    result = []
    for version in versions:
        v_match = re.match(r'^(\d+)\.(\d+)\.(\d+)', version)
        if v_match:
            v_major, v_minor, v_patch = map(int, v_match.groups())
            if v_major == base_major:
                if v_minor < base_minor:
                    result.append(version)
                elif v_minor == base_minor and v_patch <= base_patch:
                    result.append(version)
    return result


def main(target_folder):
    if not os.path.exists(target_folder):
        print(f"[에러] 경로가 존재하지 않습니다: {target_folder}")
        return

    folders = [f for f in os.listdir(target_folder) if os.path.isdir(os.path.join(target_folder, f))]

    for folder in folders:
        pkg_name, pkg_version = parse_folder_name(folder)
        if not pkg_name or not pkg_version:
            print(f"[스킵] 폴더명 파싱 실패: {folder}")
            continue

        print(f"\n[처리 중] {pkg_name} - {pkg_version}")
        versions = get_all_versions(pkg_name)
        if not versions:
            continue

        target_versions = filter_versions(versions, pkg_version)
        print(f"  └─ 타겟 버전들: {target_versions}")

        for v in target_versions:
            output_dir = f"./downstream_infos/{pkg_name}_{v}_dependencies.json"
            os.makedirs(os.path.dirname(output_dir), exist_ok=True)
            with open(output_dir, "w") as outfile:
                try:
                    subprocess.run(["python3", "get_downstream_at2.py", pkg_name, v], stdout=outfile, stderr=subprocess.DEVNULL)
                    print(f"    ✔ 저장됨: {output_dir}")
                except Exception as e:
                    print(f"    ❌ 실패: {pkg_name}@{v} - {e}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("사용법: python3 get_downstream_all.py <폴더경로>")
        sys.exit(1)

    target_folder = sys.argv[1]
    main(target_folder)
