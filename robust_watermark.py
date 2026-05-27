import cv2
import numpy as np
import pywt
import sys
import os

# =========================================================================
# 🛡️ GLOBAL CONFIGURATION & CRYPTOGRAPHIC CONSTANTS
# =========================================================================

# 24-bit robust magic header to verify the presence of the digital seal
ROBUST_MAGIC_HEADER = [1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]

# Selected 16 stable coefficients from BH sub-bands for Spread Spectrum modulation
SELECTED_COEFFS = [
    ('LH', 0, 1), ('LH', 0, 2), ('LH', 1, 0), ('LH', 1, 1),
    ('LH', 1, 2), ('LH', 2, 0), ('LH', 2, 1), ('LH', 2, 2),
    ('HL', 0, 1), ('HL', 0, 2), ('HL', 1, 0), ('HL', 1, 1),
    ('HL', 1, 2), ('HL', 2, 0), ('HL', 2, 1), ('HL', 2, 2),
]

# =========================================================================
# 🧮 MATHEMATICAL AUXILIARY FUNCTIONS
# =========================================================================

def mulberry32_prng(seed: int):
    """
    Deterministic Mulberry32 Pseudo-Random Number Generator.
    Ensures identical noise generation sequence across Python and TypeScript nodes.
    """
    h = seed & 0xFFFFFFFF
    def next_val():
        nonlocal h
        h = (h + 0x6D2B79F5) & 0xFFFFFFFF
        t = Math_imul(h ^ (h >> 15), 1 | h)
        t = (t + Math_imul(t ^ (t >> 7), 61 | t)) ^ t
        return (((t ^ (t >> 14)) & 0xFFFFFFFF) >> 0) / 4294967296.0
    return next_val


def Math_imul(a: int, b: int) -> int:
    """Emulates 32-bit signed integer multiplication (equivalent to JavaScript Math.imul)"""
    a = a & 0xFFFFFFFF
    b = b & 0xFFFFFFFF
    # Calculate product in 64-bit and then truncate to 32-bit signed
    product = a * b
    return np.int32(product & 0xFFFFFFFF)


def get_pn_sequence(bit_index: int, length: int) -> np.ndarray:
    """Generates orthogonal pseudo-random noise sequence representing a specific payload bit index."""
    gen = mulberry32_prng(133719 + bit_index)
    seq = []
    for _ in range(length):
        seq.append(-1.0 if gen() < 0.5 else 1.0)
    return np.array(seq, dtype=np.float32)


def string_to_fixed_bits(payload_str: str) -> list:
    """Converts a standard string to a 424-bit array with magic header flags and zero-padding."""
    bits = list(ROBUST_MAGIC_HEADER)
    
    encoded_bytes = payload_str.encode('utf-8')
    padded_bytes = bytearray(50)  # Standardized 50 bytes
    for i in range(min(len(encoded_bytes), 50)):
        padded_bytes[i] = encoded_bytes[i]
        
    for byte in padded_bytes:
        for j in range(7, -1, -1):
            bits.append((byte >> j) & 1)
            
    return bits


def fixed_bits_to_string(bits: list) -> str:
    """Decodes robust string payloads from structured bits by stripping headers and zero padding."""
    payload_bits = bits[len(ROBUST_MAGIC_HEADER):]
    decoded_bytes = bytearray()
    
    for i in range(0, len(payload_bits), 8):
        byte_bits = payload_bits[i:i+8]
        if len(byte_bits) < 8:
            break
        byte_val = 0
        for b in byte_bits:
            byte_val = (byte_val << 1) | b
        decoded_bytes.append(byte_val)
        
    # Filter non-printable ASCII / control characters and decode UTF-8 safely
    try:
        # Trim null trailing characters
        trimmed = decoded_bytes.rstrip(b'\x00')
        return trimmed.decode('utf-8', errors='ignore')
    except Exception:
        return ""


# =========================================================================
# 🔮 HAAR DISCRETE WAVELET TRANSFORM (2D DWT / 2D IDWT)
# =========================================================================

def haar_dwt_8x8(block: np.ndarray):
    """Computes a 2D 1-level Discrete Haar Wavelet Transform on an 8x8 matrix."""
    coeffs = pywt.dwt2(block, 'haar')
    LL, (LH, HL, HH) = coeffs
    return LL, LH, HL, HH


def haar_idwt_8x8(LL: np.ndarray, LH: np.ndarray, HL: np.ndarray, HH: np.ndarray) -> np.ndarray:
    """Computes a 2D 1-level Inverse Haar Wavelet Transform back to pixel domain."""
    coeffs = LL, (LH, HL, HH)
    block_reconstructed = pywt.idwt2(coeffs, 'haar')
    return block_reconstructed


# =========================================================================
# 🛡️ ROBUST WATERMARK EMBEDDING ENGINE (DWT-SS)
# =========================================================================

def embed_robust_watermark(image_path: str, output_path: str, custom_owner: str, watermark_intensity: float = 24.0) -> bool:
    """
    Embeds an invisible Wavelet-domain Spread Spectrum (DWT-SS) watermark into image's Luminance (Y channel).
    Extremely resistant against screenshots, cropping, resizing, and JPEG compression.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"원본 이미지를 고해상도 리포지토리에서 찾을 수 없습니다: {image_path}")

    # Convert BGR to YCrCb space to separate Luminance (Y) channel from color channels
    ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
    Y = ycrcb[:, :, 0].astype(np.float32)
    Cr = ycrcb[:, :, 1]
    Cb = ycrcb[:, :, 2]

    H, W = Y.shape
    num_blocks_x = W // 8
    num_blocks_y = H // 8

    if num_blocks_x < 4 or num_blocks_y < 4:
        raise ValueError("워터마크를 각 블록단위로 안정적으로 내장하기에 이미지의 면적이 너무 작습니다.")

    PAYLOAD_BIT_LEN = 24 + 50 * 8  # 424 bits
    bits = string_to_fixed_bits(custom_owner)

    block_index = 0
    for by in range(num_blocks_y):
        for bx in range(num_blocks_x):
            bit_pos = block_index % PAYLOAD_BIT_LEN
            bit = bits[bit_pos]
            bit_val = 1.0 if bit == 1 else -1.0

            x0 = bx * 8
            y0 = by * 8
            block_y = Y[y0:y0+8, x0:x0+8]

            # 2D DWT transform
            LL, LH, HL, HH = haar_dwt_8x8(block_y)

            # Compute current spread spectrum correlation
            PN = get_pn_sequence(bit_pos, 16)
            S = 0.0
            for i, (band, r, c) in enumerate(SELECTED_COEFFS):
                coeff_val = LH[r, c] if band == 'LH' else HL[r, c]
                S += coeff_val * PN[i]

            # Modulate coefficient values if correlation constraint is violated
            if S * bit_val < watermark_intensity:
                diff = (bit_val * watermark_intensity) - S
                adjustment = diff / 16.0
                for i, (band, r, c) in enumerate(SELECTED_COEFFS):
                    if band == 'LH':
                        LH[r, c] += adjustment * PN[i]
                    else:
                        HL[r, c] += adjustment * PN[i]

            # Reconstruct high-fidelity modified block via inverse DWT
            reconstructed = haar_idwt_8x8(LL, LH, HL, HH)
            Y[y0:y0+8, x0:x0+8] = np.clip(reconstructed, 0, 255)
            block_index += 1

    # Merge modified luminance channel back and output the high-fidelity protected image
    ycrcb[:, :, 0] = np.clip(Y, 0, 255).astype(np.uint8)
    watermarked_bgr = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)
    cv2.imwrite(output_path, watermarked_bgr)
    return True


# =========================================================================
# 🧐 ROBUST BLIND WATERMARK DETECTION ENGINE (DWT-SS)
# =========================================================================

def decode_with_alignment(Y_channel: np.ndarray, dx: int, dy: int) -> tuple:
    """Decodes robust bits at a specific pixel alignment offset."""
    H, W = Y_channel.shape
    num_blocks_x = (W - dx) // 8
    num_blocks_y = (H - dy) // 8

    if num_blocks_x < 4 or num_blocks_y < 4:
        return 0.0, 0, []

    PAYLOAD_BIT_LEN = 424
    bit_correlations = np.zeros(PAYLOAD_BIT_LEN, dtype=np.float32)
    bit_counts = np.zeros(PAYLOAD_BIT_LEN, dtype=np.int32)

    block_index = 0
    for by in range(num_blocks_y):
        for bx in range(num_blocks_x):
            x0 = dx + bx * 8
            y0 = dy + by * 8
            block_y = Y_channel[y0:y0+8, x0:x0+8]

            LL, LH, HL, HH = haar_dwt_8x8(block_y)

            bit_pos = block_index % PAYLOAD_BIT_LEN
            PN = get_pn_sequence(bit_pos, 16)

            S = 0.0
            for i, (band, r, c) in enumerate(SELECTED_COEFFS):
                coeff_val = LH[r, c] if band == 'LH' else HL[r, c]
                S += coeff_val * PN[i]

            bit_correlations[bit_pos] += S
            bit_counts[bit_pos] += 1
            block_index += 1

    decoded_bits = []
    for i in range(PAYLOAD_BIT_LEN):
        if bit_counts[i] == 0:
            decoded_bits.append(0)
        else:
            decoded_bits.append(1 if bit_correlations[i] > 0 else 0)

    # Calculate magic header match ratio
    header_matches = 0
    for i in range(len(ROBUST_MAGIC_HEADER)):
        if decoded_bits[i] == ROBUST_MAGIC_HEADER[i]:
            header_matches += 1

    ratio = header_matches / len(ROBUST_MAGIC_HEADER)
    return ratio, header_matches, decoded_bits


def detect_robust_watermark(captured_image_path: str) -> dict:
    """
    Decodes robust digital watermarks from blurred, resized, captured (screenshot),
    or cropped images by sweeping physical offsets, scaling ratios, and channel values.
    """
    img = cv2.imread(captured_image_path)
    if img is None:
        raise FileNotFoundError(f"스캔할 대상을 식별할 수 없습니다: {captured_image_path}")

    # Convert to grayscale / Luminance to support black-and-white screenshots correctly
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    H, W = gray.shape

    # 1. Direct rapid assessment at native scale first
    ratio, matches, decoded_bits = decode_with_alignment(gray, 0, 0)
    if ratio >= 0.78:
        owner = fixed_bits_to_string(decoded_bits)
        return {
            "verified": True,
            "score": int(ratio * 100),
            "owner": owner if owner else "Verified Owner Signature",
            "message": f"원본 원치 정합 판별 통과. 일치율: {ratio*100:.1f}%. 숨겨진 서명을 성공적으로 추출했습니다."
        }

    # 2. Extract central 384x384 window patch for grid-scale alignment sweep to survive crops
    patch_size = 384
    if W <= patch_size and H <= patch_size:
        center_patch = gray
    else:
        start_x = (W - patch_size) // 2
        start_y = (H - patch_size) // 2
        center_patch = gray[start_y:start_y+patch_size, start_x:start_x+patch_size]

    # Broad sweep scale coefficients to find hidden signals that underwent severe downsizing/upscaling
    SCALE_FACTORS = [1.0, 0.75, 0.67, 0.5, 0.8, 1.2, 1.33, 1.5, 2.0]
    
    best_ratio = ratio
    best_matches = matches
    best_bits = decoded_bits
    best_scale = 1.0
    best_dx = 0
    best_dy = 0

    for scale in SCALE_FACTORS:
        if scale == 1.0:
            scaled_patch = center_patch
        else:
            tar_w = max(128, int(center_patch.shape[1] * scale))
            tar_h = max(128, int(center_patch.shape[0] * scale))
            scaled_patch = cv2.resize(center_patch, (tar_w, tar_h), interpolation=cv2.INTER_LINEAR)

        # 8x8 Pixel displacement sweep to align with original block boundaries
        for dy in range(0, 8, 1):
            for dx in range(0, 8, 1):
                r_val, m_val, b_val = decode_with_alignment(scaled_patch, dx, dy)
                if r_val > best_ratio:
                    best_ratio = r_val
                    best_matches = m_val
                    best_bits = b_val
                    best_scale = scale
                    best_dx = dx
                    best_dy = dy
                    if best_ratio >= 0.88:
                        break
            if best_ratio >= 0.88:
                break
        if best_ratio >= 0.88:
            break

    # 3. Final extraction on optimal global translation alignment parameter
    confidence_threshold = 0.70
    if best_ratio >= confidence_threshold:
        if best_scale == 1.0:
            final_gray = gray
        else:
            tar_w = max(256, int(W * best_scale))
            tar_h = max(256, int(H * best_scale))
            final_gray = cv2.resize(gray, (tar_w, tar_h), interpolation=cv2.INTER_LINEAR)

        _, _, final_bits = decode_with_alignment(final_gray, best_dx, best_dy)
        owner_name = fixed_bits_to_string(final_bits)

        return {
            "verified": True,
            "score": int(best_ratio * 100),
            "owner": owner_name if owner_name else "Verified Owner Signature",
            "message": f"주파수 복구 스캔 통과 (스케일 배율: {best_scale}x, 오프셋: {best_dx},{best_dy}px). 일치율: {best_ratio*100:.1f}%. 보이지 않는 법적 저작권 씰이 유지되었습니다."
        }

    return {
        "verified": False,
        "score": int(best_ratio * 100),
        "owner": None,
        "message": f"검증 실패. 워터마크 신호 일치도 부족 ({best_ratio*100:.1f}%). 이미지가 지나치게 공격받았거나 오리지널 씰이 누락되었습니다."
    }

# =========================================================================
# 🚀 TEST EXECUTION OR DIRECT CLI INVOCATION
# =========================================================================

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\n=======================================================")
        print("💻 Digital Watermarker Robust Python Utility CLI Usage:")
        print("=======================================================")
        print("[1] Embed Watermark to Single Image:")
        print("    python robust_watermark.py embed original.png watermarked.png '© 2026 Core Tech Inc.'")
        print("\n[2] Detect Watermark from Single Image:")
        print("    python robust_watermark.py detect watermarked.png")
        print("\n[3] Batch-Embed Watermark to Directory:")
        print("    python robust_watermark.py batch-embed ./input_folder ./output_folder '© 2026 Core Tech'")
        print("\n[4] Batch-Detect Watermark in Directory:")
        print("    python robust_watermark.py batch-detect ./target_folder")
        print("=======================================================\n")
        sys.exit(0)

    action = sys.argv[1].lower()
    
    if action == "embed":
        if len(sys.argv) < 5:
            print("오류: 인수가 누락되었습니다. (사용법: python robust_watermark.py embed <원본_이미지> <출력_경로> <서명_텍스트>)")
            sys.exit(1)
        orig_img = sys.argv[2]
        output_img = sys.argv[3]
        signature = sys.argv[4]
        
        print(f"🔄 워터마크 내장 프로세스를 시작합니다...")
        print(f"   - 원본 파일: {orig_img}")
        print(f"   - 서명 문구: '{signature}'")
        try:
            embed_robust_watermark(orig_img, output_img, signature, watermark_intensity=24.0)
            print("🚀 [성공] 눈에 보이지 않는 DWT-SS 하이브리드 워터마크가 완벽히 내장되었습니다!")
            print(f"   - 저장 완료: {output_img}")
        except Exception as e:
            print(f"❌ 임베딩 실패: {e}")
            sys.exit(1)
            
    elif action == "detect":
        if len(sys.argv) < 3:
            print("오류: 인수가 누락되었습니다. (사용법: python robust_watermark.py detect <검증_대상_파일>)")
            sys.exit(1)
        target_img = sys.argv[2]
        
        print(f"🔍 '{target_img}' 내부에 숨겨진 스테간 지문 복구 스캔을 개시합니다...")
        try:
            report = detect_robust_watermark(target_img)
            print("\n=======================================================")
            print("        🧐 DIGITAL WATERMARK VERIFICATION REPORT       ")
            print("=======================================================")
            print(f" • 검증 결과(Status)    : {'✅ VERIFIED (정품 확인)' if report['verified'] else '❌ UNVERIFIED (확인 불가)'}")
            print(f" • 무결성 매칭율(Score) : {report['score']}%")
            print(f" • 소유자 정보(Owner)   : {report['owner']}")
            print(f" • 진단 가이드(Remarks) : {report['message']}")
            print("=======================================================\n")
        except Exception as e:
            print(f"❌ 디코딩 실패: {e}")
            sys.exit(1)
            
    elif action == "batch-embed":
        if len(sys.argv) < 5:
            print("오류: 인수가 누락되었습니다. (사용법: python robust_watermark.py batch-embed <원본_폴더_경로> <출출력_폴더_경로> <서명_텍스트>)")
            sys.exit(1)
        input_dir = sys.argv[2]
        output_dir = sys.argv[3]
        signature = sys.argv[4]
        
        if not os.path.exists(input_dir):
            print(f"❌ 오류: 원본 폴더가 존재하지 않습니다: {input_dir}")
            sys.exit(1)
            
        os.makedirs(output_dir, exist_ok=True)
        
        valid_extensions = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp')
        files = [f for f in os.listdir(input_dir) if f.lower().endswith(valid_extensions)]
        
        if not files:
            print(f"ℹ️ 알림: 해당 폴더에 처리 가능한 이미지 파일이 없습니다. (지원 확장자: {valid_extensions})")
            sys.exit(0)
            
        print(f"\n⚡ 복수 이미지 일괄 내장(Batch-Embedding) 작업을 개시합니다... (총 {len(files)}개 파일)")
        print(f" - 입력 경로: {input_dir}")
        print(f" - 출력 경로: {output_dir}")
        print(f" - 서명 문구: '{signature}'")
        print("--------------------------------------------------------------------------------")
        
        success_count = 0
        failure_count = 0
        
        for idx, filename in enumerate(files, 1):
            input_path = os.path.join(input_dir, filename)
            output_path = os.path.join(output_dir, filename)
            
            print(f"[{idx}/{len(files)}] {filename} 처리 중...", end="", flush=True)
            try:
                embed_robust_watermark(input_path, output_path, signature, watermark_intensity=24.0)
                print(" -> ✅ 완료")
                success_count += 1
            except Exception as e:
                print(f" -> ❌ 실패 ({str(e)})")
                failure_count += 1
                
        print("--------------------------------------------------------------------------------")
        print(f"🎉 일괄 처리 완료! (성공: {success_count}개, 실패: {failure_count}개)")
        print(f"💾 결과물은 {output_dir} 폴더에 정교하게 저장되었습니다.\n")
        
    elif action == "batch-detect":
        if len(sys.argv) < 3:
            print("오류: 인수가 누락되었습니다. (사용법: python robust_watermark.py batch-detect <검증_대상_폴더_경로>)")
            sys.exit(1)
        target_dir = sys.argv[2]
        
        if not os.path.exists(target_dir):
            print(f"❌ 오류: 대상 폴더가 존재하지 않습니다: {target_dir}")
            sys.exit(1)
            
        valid_extensions = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp')
        files = [f for f in os.listdir(target_dir) if f.lower().endswith(valid_extensions)]
        
        if not files:
            print(f"ℹ️ 알림: 검증 가능한 이미지 파일이 없습니다. (지원 확장자: {valid_extensions})")
            sys.exit(0)
            
        print(f"\n🔍 폴더 내 모든 파일 일괄 스캔(Batch-Detection)을 개시합니다... (총 {len(files)}개 파일)")
        print(f" - 대상 폴더: {target_dir}")
        print("--------------------------------------------------------------------------------")
        
        verified_count = 0
        unverified_count = 0
        
        print(f"{'파일명 (Filename)':<30} | {'결과 (Status)':<12} | {'매칭율 (Score)':<12} | {'식별된 소유자 (Owner)'}")
        print("-" * 85)
        
        for filename in files:
            full_path = os.path.join(target_dir, filename)
            try:
                report = detect_robust_watermark(full_path)
                status_str = "✅ VERIFIED" if report['verified'] else "❌ FAILED"
                score_str = f"{report['score']}%"
                owner_str = report['owner'] if report['owner'] else "-"
                
                # Truncate filename if too long for layout
                display_name = filename[:27] + "..." if len(filename) > 30 else filename
                print(f"{display_name:<30} | {status_str:<12} | {score_str:<12} | {owner_str}")
                
                if report['verified']:
                    verified_count += 1
                else:
                    unverified_count += 1
            except Exception as e:
                display_name = filename[:27] + "..." if len(filename) > 30 else filename
                print(f"{display_name:<30} | ❌ ERROR       | {'-':<12} | 에러: {str(e)[:30]}")
                unverified_count += 1
                
        print("-" * 85)
        print(f"📊 스캔 총평: 검증 이미지 {verified_count}개 | 미매칭/원본 {unverified_count}개 (총 {len(files)}개 중)")
        print("================================================================================\n")
        
    else:
        print(f"알 수 없는 액션 식별자: {action}. 사용법을 참고하시기 바랍니다.")
