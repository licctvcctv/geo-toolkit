import json
import urllib.request
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.views.decorators.csrf import csrf_exempt

from .geo_calculations import (
    calculate_structural_formula,
    calculate_chlorite_temperature,
    calculate_biotite_temperature,
    remove_outliers,
    identify_mineral,
    classify_chlorite,
    classify_biotite,
    classify_muscovite,
)

# AI API 配置（密钥仅存在于后端，不暴露给前端）
SILICONFLOW_API_KEY = 'sk-pqeadxafmjyyjlfvwdboamyktxxpghhyfrtrtdzqwbqgkwdm'
SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/chat/completions'
SILICONFLOW_MODEL = 'Qwen/QwQ-32B'


def _parse_json(request):
    try:
        return json.loads(request.body)
    except json.JSONDecodeError:
        return None


# ============ 用户认证 ============

@csrf_exempt
@require_POST
def register(request):
    body = _parse_json(request)
    if not body:
        return JsonResponse({'error': '请求格式错误'}, status=400)

    username = body.get('username', '').strip()
    password = body.get('password', '').strip()

    if not username or not password:
        return JsonResponse({'error': '用户名和密码不能为空'}, status=400)

    if User.objects.filter(username=username).exists():
        return JsonResponse({'error': '用户名已存在'}, status=400)

    User.objects.create_user(username=username, password=password)
    return JsonResponse({'message': '注册成功'})


@csrf_exempt
@require_POST
def login_view(request):
    body = _parse_json(request)
    if not body:
        return JsonResponse({'error': '请求格式错误'}, status=400)

    username = body.get('username', '')
    password = body.get('password', '')

    user = authenticate(request, username=username, password=password)
    if user is None:
        return JsonResponse({'error': '用户名或密码错误'}, status=400)

    auth_login(request, user)
    return JsonResponse({
        'message': '登录成功',
        'user': {'id': user.id, 'username': user.username},
        'token': request.session.session_key or 'session',
    })


@csrf_exempt
@require_POST
def logout_view(request):
    auth_logout(request)
    return JsonResponse({'message': '已登出'})


@csrf_exempt
def me(request):
    if request.user.is_authenticated:
        return JsonResponse({
            'user': {'id': request.user.id, 'username': request.user.username}
        })
    return JsonResponse({'error': '未登录'}, status=401)


# ============ 绿泥石温度计 ============

@csrf_exempt
@require_POST
def thermometer_calculate(request):
    body = _parse_json(request)
    if not body:
        return JsonResponse({'error': '请求格式错误'}, status=400)

    data = body.get('data', [])
    method = body.get('method', 'All')
    remove_outliers_flag = body.get('removeOutliersFlag', True)

    try:
        calculated = []
        for row in data:
            formula = calculate_structural_formula(row, 28)
            if not formula:
                continue
            temps = calculate_chlorite_temperature(formula)
            temp = temps if method == 'All' else temps.get(method, 0)
            calculated.append({**row, **formula, 'Temperature': temp, 'Temps': temps})

        original_count = len(data)
        valid_count = len(calculated)

        if remove_outliers_flag and len(calculated) > 3:
            if method == 'All':
                for item in calculated:
                    item['_tempForFilter'] = item['Temps']['Cathelineau']
                calculated = remove_outliers(calculated, '_tempForFilter')
                for item in calculated:
                    item.pop('_tempForFilter', None)
            else:
                calculated = remove_outliers(calculated, 'Temperature')

        cleaned_count = len(calculated)

        return JsonResponse({
            'results': calculated,
            'summary': {
                'original': original_count,
                'valid': valid_count,
                'cleaned': cleaned_count,
                'outliersRemoved': valid_count - cleaned_count,
            }
        })
    except Exception as e:
        return JsonResponse({'error': f'计算失败: {str(e)}'}, status=400)


# ============ 黑云母温度计 ============

@csrf_exempt
@require_POST
def thermometer_biotite(request):
    body = _parse_json(request)
    if not body:
        return JsonResponse({'error': '请求格式错误'}, status=400)

    data = body.get('data', [])
    remove_outliers_flag = body.get('removeOutliersFlag', True)

    try:
        calculated = []
        for row in data:
            formula = calculate_structural_formula(row, 22)
            if not formula:
                continue
            temps = calculate_biotite_temperature(formula)
            classification = classify_biotite(formula)
            calculated.append({**row, **formula, 'Temps': temps, 'Classification': classification})

        original_count = len(data)
        valid_count = len(calculated)

        if remove_outliers_flag and len(calculated) > 3:
            for item in calculated:
                item['_tempForFilter'] = item['Temps']['Henry']
            calculated = remove_outliers(calculated, '_tempForFilter')
            for item in calculated:
                item.pop('_tempForFilter', None)

        cleaned_count = len(calculated)

        return JsonResponse({
            'results': calculated,
            'summary': {
                'original': original_count,
                'valid': valid_count,
                'cleaned': cleaned_count,
                'outliersRemoved': valid_count - cleaned_count,
            }
        })
    except Exception as e:
        return JsonResponse({'error': f'计算失败: {str(e)}'}, status=400)


# ============ 矿物识别 ============

@csrf_exempt
@require_POST
def mineral_identify(request):
    body = _parse_json(request)
    if not body:
        return JsonResponse({'error': '请求格式错误'}, status=400)

    data = body.get('data', [])

    try:
        results = []
        for row in data:
            formula_22 = calculate_structural_formula(row, 22)
            formula_28 = calculate_structural_formula(row, 28)
            if not formula_22 or not formula_28:
                results.append({**row, 'error': 'Invalid data'})
                continue

            mineral_type = identify_mineral(formula_22)

            classification = ''
            final_formula = formula_22
            temps = None

            if mineral_type == 'Chlorite':
                final_formula = formula_28
                classification = classify_chlorite(formula_28)
                temps = {'type': 'chlorite', 'values': calculate_chlorite_temperature(formula_28)}
            elif mineral_type == 'Biotite':
                classification = classify_biotite(formula_22)
                temps = {'type': 'biotite', 'values': calculate_biotite_temperature(formula_22)}
            elif mineral_type == 'Muscovite':
                classification = classify_muscovite(formula_22)

            results.append({
                **row,
                'Type': mineral_type,
                'Classification': classification,
                'Formula': final_formula,
                'Temps': temps,
            })

        return JsonResponse({'results': results})
    except Exception as e:
        return JsonResponse({'error': f'识别失败: {str(e)}'}, status=400)


# ============ AI 聊天代理 ============

@csrf_exempt
@require_POST
def ai_chat(request):
    """代理前端的 AI 请求到 SiliconFlow，流式转发，密钥不暴露给前端"""
    body = _parse_json(request)
    if not body:
        return JsonResponse({'error': '请求格式错误'}, status=400)

    messages = body.get('messages', [])
    if not messages:
        return JsonResponse({'error': 'messages 不能为空'}, status=400)

    payload = json.dumps({
        'model': SILICONFLOW_MODEL,
        'messages': messages,
        'stream': True,
        'max_tokens': body.get('max_tokens', 2048),
        'temperature': body.get('temperature', 0.7),
    }).encode('utf-8')

    req = urllib.request.Request(
        SILICONFLOW_API_URL,
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {SILICONFLOW_API_KEY}',
        },
    )

    def stream_response():
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                for line in resp:
                    decoded = line.decode('utf-8', errors='replace')
                    yield decoded
        except Exception as e:
            yield f'data: {json.dumps({"error": str(e)})}\n\n'

    response = StreamingHttpResponse(stream_response(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response
