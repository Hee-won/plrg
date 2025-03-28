import sys
import requests
import json

# 사용자 입력을 통해 root_package, root_version을 받음
if len(sys.argv) != 3:
    print("사용법: python this.py <root_package> <root_version>")
    sys.exit(1)

root_package = sys.argv[1]
root_version = sys.argv[2]
depth_limit = 1  # 필요시 여기도 인자로 받을 수 있음

# 재귀적으로 의존 패키지 정보를 가져오는 함수
def fetch_dependents(package, version, current_depth, depth_limit):
    # Scoped 패키지 처리
    if package.startswith('@'):
        parsed = package.split("/")
        url = f'https://deps.dev/_/s/npm/p/{parsed[0]}%2F{parsed[1]}/v/{version}/dependents'
    else:
        url = f'https://deps.dev/_/s/npm/p/{package}/v/{version}/dependents'

    try:
        response = requests.get(url)
        response.raise_for_status()
        json_data = response.json()
    except requests.exceptions.RequestException as e:
        print(f"데이터 가져오기 오류: {e}")
        return {}

    direct_sample = json_data.get('directSample', [])
    direct_count = json_data.get('directCount', [])

    tree = {
        "package": package,
        "version": version,
        "dep_nums": direct_count,
        "dependents": [],
    }

    i = 1
    for sample in direct_sample:
        dep_name = sample['package']['name']
        dep_version = sample['version']

        if current_depth < depth_limit:
            dependent_tree = fetch_dependents(dep_name, dep_version, current_depth + 1, depth_limit)
            dependents = dependent_tree.get("dependents", {})
            tree["dependents"].append({
                "no": i,
                "package": dep_name,
                "version": dep_version,
                "dep_nums": len(dependents),
                "dependents": dependents
            })
        else:
            tree["dependents"].append({
                "no": i,
                "package": dep_name,
                "version": dep_version,
            })
        i += 1

    return tree

# 루트 패키지부터 탐색 시작
dependency_tree = fetch_dependents(root_package, root_version, 1, depth_limit)

# JSON 형식으로 출력
print(json.dumps(dependency_tree, indent=4))
