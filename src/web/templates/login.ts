// 登录页面模板

import { layout } from './layout'

export function loginPage(): string {
    const content = `
    <div style="position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--spacing-lg); background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);">
        <!-- 背景装饰元素 -->
        <div style="position: absolute; top: 10%; left: 10%; width: 200px; height: 200px; background: linear-gradient(45deg, rgba(0, 122, 255, 0.1), rgba(52, 199, 89, 0.1)); border-radius: 50%; filter: blur(40px); animation: float 6s ease-in-out infinite;"></div>
        <div style="position: absolute; bottom: 10%; right: 15%; width: 300px; height: 300px; background: linear-gradient(45deg, rgba(255, 59, 48, 0.08), rgba(255, 204, 0, 0.08)); border-radius: 50%; filter: blur(50px); animation: float 8s ease-in-out infinite reverse;"></div>
        
        <div style="max-width: 1000px; width: 100%; position: relative; z-index: 10;">
            <!-- 宽屏登录卡片 -->
            <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: var(--radius-3xl); overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1), 0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6);">
                <div style="display: grid; grid-template-columns: 1fr 1px 1fr; min-height: 500px;">
                    ${getBrandSection()}
                    <div style="background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.1), transparent);"></div>
                    ${getLoginFormSection()}
                </div>
            </div>
        </div>
    </div>
    
    <style>
        ${getLoginPageStyles()}
    </style>
    
    <script>
        ${getLoginPageScripts()}
    </script>
    `
    return layout(content)
}

function getBrandSection(): string {
    return `
        <!-- 左侧：品牌展示区域 -->
        <div style="padding: var(--spacing-3xl); display: flex; flex-direction: column; justify-content: center; align-items: center; background: linear-gradient(135deg, rgba(0, 122, 255, 0.05), rgba(88, 86, 214, 0.05));">
            <div class="login-logo" style="margin-bottom: var(--spacing-xl);">
                <div style="width: 120px; height: 120px; background: linear-gradient(135deg, var(--color-system-blue), #5856D6); border-radius: var(--radius-3xl); display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 40px rgba(0, 122, 255, 0.3); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <div style="font-size: 56px; line-height: 1; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));">⚖️</div>
                </div>
            </div>
            <h1 style="font-size: 48px; font-weight: var(--font-weight-bold); background: linear-gradient(135deg, var(--color-label), var(--color-secondary-label)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: var(--spacing-lg); line-height: 1.11111; letter-spacing: -0.02em; text-align: center;">One Balance</h1>
            <p style="color: var(--color-secondary-label); font-size: 20px; line-height: 1.47; letter-spacing: -0.022em; text-align: center; margin-bottom: var(--spacing-xl); font-weight: var(--font-weight-medium);">智能管理您的 API 密钥<br>完美平衡负载</p>
            
            <!-- 特性列表 -->
            <div style="display: flex; flex-direction: column; gap: var(--spacing-md); width: 100%; max-width: 320px;">
                <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                    <div style="width: 8px; height: 8px; background: var(--color-system-blue); border-radius: 50%;"></div>
                    <span style="color: var(--color-secondary-label); font-size: 16px; font-weight: var(--font-weight-medium);">多提供商支持</span>
                </div>
                <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                    <div style="width: 8px; height: 8px; background: var(--color-system-green); border-radius: 50%;"></div>
                    <span style="color: var(--color-secondary-label); font-size: 16px; font-weight: var(--font-weight-medium);">智能负载均衡</span>
                </div>
                <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                    <div style="width: 8px; height: 8px; background: var(--color-system-purple); border-radius: 50%;"></div>
                    <span style="color: var(--color-secondary-label); font-size: 16px; font-weight: var(--font-weight-medium);">实时状态监控</span>
                </div>
            </div>
        </div>
    `
}

function getLoginFormSection(): string {
    return `
        <!-- 右侧：登录表单区域 -->
        <div style="padding: var(--spacing-lg) var(--spacing-3xl); display: flex; flex-direction: column; justify-content: center;">
            <div style="max-width: 600px; margin: 0 auto; width: 100%;">
                <h2 style="font-size: 32px; font-weight: var(--font-weight-bold); color: var(--color-label); margin-bottom: var(--spacing-sm); text-align: center;">欢迎回来</h2>
                <p style="color: var(--color-secondary-label); font-size: 17px; text-align: center; margin-bottom: var(--spacing-3xl);">请输入您的认证密钥以继续</p>
                
                <!-- 错误提示区域 -->
                <div id="error-message" style="display: none; background: rgba(255, 59, 48, 0.1); border: 1px solid rgba(255, 59, 48, 0.2); border-radius: var(--radius-lg); padding: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                    <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                        <svg style="width: 20px; height: 20px; color: var(--color-system-red); flex-shrink: 0;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 18.5c-.77.833.192 2.5 1.732 2.5z"></path>
                        </svg>
                        <span style="color: var(--color-system-red); font-size: 15px; font-weight: var(--font-weight-medium);" id="error-text">认证密钥无效，请检查后重试</span>
                    </div>
                </div>
                
                <form action="/login" method="POST" style="display: flex; flex-direction: column; gap: var(--spacing-xl);" onsubmit="handleFormSubmit(event)">
                    <div style="position: relative;">
                        <label for="auth_key" style="display: block; color: var(--color-label); font-size: 17px; font-weight: var(--font-weight-semibold); margin-bottom: var(--spacing-md); line-height: 1.4; letter-spacing: -0.022em;">认证密钥</label>
                        <div style="position: relative;">
                            <div style="position: absolute; left: var(--spacing-lg); top: 50%; transform: translateY(-50%); z-index: 2;">
                                <svg style="width: 20px; height: 20px; color: var(--color-tertiary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3.586l6.586-6.586A6 6 0 0121 9z"></path>
                                </svg>
                            </div>
                            <input type="password" id="auth_key" name="auth_key" 
                                   class="login-input" 
                                   style="width: 100%; padding: var(--spacing-xl) var(--spacing-xl) var(--spacing-xl) 52px; font-size: 15px; border-radius: var(--radius-xl); border: 1.5px solid var(--color-system-gray4); background: var(--color-system-background); transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); font-weight: var(--font-weight-medium); font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; letter-spacing: 0.3px; min-height: 56px;"
                                   placeholder="sk-1234567890abcdefghijklmnopqrstuvwxyz12345" 
                                   required
                                   onfocus="clearError(); this.style.borderColor='var(--color-system-blue)'; this.style.boxShadow='0 0 0 4px rgba(0, 122, 255, 0.1), 0 4px 16px rgba(0, 0, 0, 0.1)'"
                                   onblur="this.style.borderColor='var(--color-system-gray4)'; this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.06)'">
                        </div>
                    </div>
                    
                    <button type="submit" id="signin-btn" style="width: 100%; padding: var(--spacing-lg) var(--spacing-xl); font-size: 17px; font-weight: var(--font-weight-semibold); border-radius: var(--radius-xl); background: linear-gradient(135deg, var(--color-system-blue), #5856D6); color: white; border: none; box-shadow: 0 4px 16px rgba(0, 122, 255, 0.3), 0 2px 8px rgba(0, 122, 255, 0.2); transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); position: relative; overflow: hidden;" 
                            onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 20px rgba(0, 122, 255, 0.4), 0 4px 12px rgba(0, 122, 255, 0.3)'"
                            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 16px rgba(0, 122, 255, 0.3), 0 2px 8px rgba(0, 122, 255, 0.2)'"
                            onmousedown="this.style.transform='translateY(0)'"
                            onmouseup="this.style.transform='translateY(-1px)'">
                        <span id="btn-text">登录</span>
                        <div id="btn-loading" style="display: none; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
                            <div style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite;"></div>
                        </div>
                    </button>
                </form>
                
                <!-- 底部提示 -->
                <div style="text-align: center; margin-top: var(--spacing-xl); padding-top: var(--spacing-xl); border-top: 1px solid rgba(0, 0, 0, 0.06);">
                    <p style="color: var(--color-tertiary-label); font-size: 14px; margin: 0; font-weight: var(--font-weight-medium);">
                        安全可靠的 API 密钥管理平台
                    </p>
                </div>
            </div>
        </div>
    `
}

function getLoginPageStyles(): string {
    return `
        @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(180deg); }
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .login-logo {
            animation: gentle-pulse 4s ease-in-out infinite;
        }
        
        @keyframes gentle-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        
        .login-input:focus::placeholder {
            opacity: 0.5;
            transform: translateX(5px);
            transition: all 0.3s ease;
        }
    `
}

function getLoginPageScripts(): string {
    return `
        function handleFormSubmit(event) {
            const btn = document.getElementById('signin-btn');
            const btnText = document.getElementById('btn-text');
            const btnLoading = document.getElementById('btn-loading');
            
            clearError();
            btnText.style.display = 'none';
            btnLoading.style.display = 'block';
            btn.disabled = true;
            btn.style.opacity = '0.9';
        }
        
        function showError(message) {
            const errorElement = document.getElementById('error-message');
            const errorText = document.getElementById('error-text');
            if (errorElement && errorText) {
                errorText.textContent = message;
                errorElement.style.display = 'block';
                errorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
        
        function clearError() {
            const errorElement = document.getElementById('error-message');
            if (errorElement) {
                errorElement.style.display = 'none';
            }
        }
        
        // 检查URL参数显示错误信息
        window.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const error = urlParams.get('error');
            if (error === 'invalid_key') {
                showError('认证密钥无效，请检查后重试');
            }
        });
    `
}
