import os
import json
import shutil

def filter_and_copy_json_files(input_dir, output_dir):
    # 결과 저장할 디렉토리가 없으면 생성
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # 대상 디렉토리에 있는 모든 파일 순회
    for filename in os.listdir(input_dir):
        if filename.endswith(".json"):
            file_path = os.path.join(input_dir, filename)

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                    # keymethod와 keystring이 모두 비어있지 않은 경우
                    if data.get("keymethod") and data.get("keystring"):
                        print(f"✔ 조건 만족: {filename}")
                        shutil.copy(file_path, os.path.join(output_dir, filename))

            except Exception as e:
                print(f"⚠️ 오류 발생: {filename} - {e}")

if __name__ == "__main__":
    input_directory = "./output_json(command-injection)"    # ✅ 여기에 입력 폴더 경로 설정
    output_directory = "./selected(command-injection)"            # 복사할 대상 폴더

    filter_and_copy_json_files(input_directory, output_directory)
