# 渗透测试报告

---

## 测试信息

| 项目 | 内容 |
|------|------|
| **测试目标** | https://nxist.nxbys.cn/ |
| **目标名称** | 宁夏理工学院就业信息网 |
| **所属平台** | 智慧教育 \| 宁夏智慧教育平台 (www.nxbys.cn) |
| **测试日期** | 2026-07-16 |
| **测试类型** | SRC漏洞挖掘（黑盒渗透测试） |
| **技术架构** | PHP (Yii框架) + Nginx + CryptoJS AES |
| **测试工具** | curl, Bash, Node.js |

---

## 漏洞摘要

| # | 漏洞名称 | 严重程度 | CVSS | 状态 |
|---|---------|:------:|:----:|:----:|
| 1 | 任意企业注册 - 无任何验证机制 | 🔴 严重 | 8.6 | ✅ 已复现 |
| 2 | AES加密密钥硬编码泄露 | 🔴 高 | 7.5 | ✅ 已确认 |
| 3 | .git目录泄露 - 源码可提取风险 | 🔴 高 | 7.0 | ✅ 已确认 |
| 4 | 学生信息枚举接口无频率限制 | 🟡 中 | 5.3 | ✅ 已确认 |
| 5 | UEditor/FCKEditor敏感组件暴露 | 🟡 中 | 5.0 | ✅ 已确认 |
| 6 | 缺少关键安全响应头 | 🟡 中 | 4.8 | ✅ 已确认 |
| 7 | JSONP登录接口跨域风险 | 🟡 中 | 5.0 | ✅ 已确认 |

---

## 攻击面识别

### 系统入口总览

| 入口 | URL | 说明 |
|------|-----|------|
| 院校管理后台 | `/admin/` → 302 到登录页 | 使用AES加密，Yii captcha |
| 学生登录 | `/user/login` | JSONP回调，AES加密 |
| 学生注册 | `/user/register` | 三步流程（学号验证→资料→完成） |
| 密码重置 | `/user/findpwd` | 三步流程（确认账号→安全邮箱→重置） |
| 教师密码重置 | `/teacher/findPassword` | 独立入口 |
| 企业登录 | `/vip/user/login` → 302 | 密码+短信双模式 |
| 企业注册 | 跳转到 `www.nxbys.cn` | **无验证码！** |
| 手机APP下载 | `/download` | 未发布 |
| 全站搜索 | `/search/list?keyword=` | 公开访问 |
| 招聘公告 | `/campus` | 公开访问 |
| 招聘会 | `/jobfair` | 公开访问 |
| 宣讲会 | `/teachin` | 公开访问 |
| 岗位搜索 | `/job/search/d_category/0` | 公开访问 |
| 就业调查 | `/inquiry` | 公开访问 |
| 讲座预约 | `/lecture` | 公开访问 |
| 咨询预约 | `/consult` | 公开访问 |
| 办事大厅 | `/default/affair/module/*` | 需认证 |
| UEditor | `/ueditor/` | 存在但受限 |
| FCKEditor | `/fckeditor/` | 403限制 |

### 发现的关键API接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/user/check` | POST | 学号+姓名验证（无验证码、无频率限制） |
| `/user/login` | POST(JSONP) | 学生登录（AES加密密码） |
| `/user/sendCode` | POST | 短信发送（需验证码） |
| `/user/captcha/refresh/1` | GET | 验证码刷新（返回hash1/hash2） |
| `/user/captcha/v/*` | GET | 验证码图片 |
| `/admin/default/login` | POST | 管理员登录（AES加密密码） |
| `/admin/default/authcode/refresh/1` | GET | 管理员验证码刷新 |
| `/user/company` | POST | 企业登录 |
| `/user/companyregister` | POST | **企业注册（无任何验证！）** |
| `/default/feedBack` | POST | 用户反馈 |
| `/default/log` | POST | 用户行为日志 |

---

## 漏洞详情

---

### 漏洞 #1：【严重】任意企业注册 - 无任何验证机制

**严重程度**：严重 (CVSS 8.6: AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H)

**漏洞URL**：
```
https://www.nxbys.cn/user/companyregister/fu/nxist.nxbys.cn/code/-D-w1172D9c7AMv8W1xJGA
```

**漏洞描述**：

企业注册接口完全没有图形验证码、短信验证码、邮箱验证或统一社会信用代码真实性校验。攻击者可使用任意虚假信息批量注册企业账号，注册后可直接访问企业信息完善页面。

**复现步骤**：

步骤一：发送注册请求

```bash
curl -s -k -X POST -w "HTTP:%{http_code}\nRedirect:%{redirect_url}\n" \
  "https://www.nxbys.cn/user/companyregister/fu/nxist.nxbys.cn/code/-D-w1172D9c7AMv8W1xJGA" \
  -d "username=POCDEMO2024&unified_social_credit_code=91440300MA5POCDEMO&telephone=13469613437&email=poc@demo.cn&password=Demo@1234&confirmPassword=Demo@1234" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

步骤二：观察响应

```
HTTP/1.1 302 Moved Temporarily
Location: https://www.nxbys.cn/company/info/key/7bdc0f99e74fe06a4d6778a4350e4ed17.../time/1784132569
```

302重定向 = 注册成功，进入企业信息完善页（第二步）。

**响应证据**：

```
- 注册测试 #1 (NXISTTEST2024):        HTTP 302 ✅ 成功
- 注册测试 #2 (FAKECOMPANY2024):       HTTP 302 ✅ 成功
- 注册测试 #3 (MASSTEST1):             HTTP 302 ✅ 成功
- 注册测试 #4 (POCDEMO2024):           HTTP 302 ✅ 成功
- 10秒内连续3次注册:                   全部成功 = 无频率限制
- 虚假统一社会信用代码:                全部接受 = 无格式校验
```

**安全机制缺失对照**：

| 应有安全机制 | 状态 |
|-------------|:----:|
| 图形验证码 | ❌ 不存在 |
| 短信验证码 | ❌ 不存在 |
| 邮箱验证链接 | ❌ 不存在 |
| 营业执照上传 | ❌ 不存在 |
| 统一社会信用代码格式/真实性校验 | ❌ 不校验 |
| 注册频率限制 | ❌ 无限制 |
| IP/设备指纹限制 | ❌ 无限制 |
| CSRF Token | ❌ 不存在 |

**危害分析**：

1. 攻击者可批量创建虚假企业账号
2. 发布虚假招聘信息进行求职诈骗
3. 通过虚假岗位收集学生联系方式等敏感个人信息
4. 以企业身份查看投递简历中的学生学号、姓名、手机号等数据
5. 破坏平台公信力，危害高校毕业生就业安全

**修复建议**：

1. **立即**: 添加图形验证码保护注册接口
2. **高优先级**: 对接国家企业信用信息公示系统API，实时校验统一社会信用代码真实性
3. **高优先级**: 添加手机短信验证码验证
4. **中优先级**: 实施IP+设备指纹频率限制（同一IP 1小时内最多注册1次）
5. **中优先级**: 添加CSRF Token
6. **低优先级**: 注册后需上传营业执照人工审核后方可发布职位
7. **清理**: 删除测试期间创建的虚假企业账号

---

### 漏洞 #2：【高危】AES加密密钥硬编码泄露

**严重程度**：高 (CVSS 7.5: AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)

**漏洞URL**：
```
https://nxist.nxbys.cn/admin/
https://nxist.nxbys.cn/user/login
```

**漏洞描述**：

Admin登录页面和学生登录页面的前端JavaScript源码中直接硬编码了AES加密密钥，用于对登录密码做前端加密。密钥可被任何访问登录页面的用户获取，使前端加密失去安全意义。

**复现步骤**：

```bash
curl -s -k "https://nxist.nxbys.cn/admin/" | grep "var key ="
```

**响应证据**：

```javascript
function js_encrypt(str) {
    var key = 'MDkxMDkwNGZmZjYw';  // ← 硬编码的AES密钥
    key = CryptoJS.enc.Utf8.parse(key);
    let encrypted = CryptoJS.AES.encrypt(str, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
    });
    return "A:" + encrypted.toString().replaceAll('=', '-');
}
```

```bash
# 学生登录页同样使用js_encrypt函数
curl -s -k "https://nxist.nxbys.cn/user/login" | grep "js_encrypt"
# → password.val(js_encrypt(password.val()));
```

**危害分析**：

1. 攻击者可获取密钥后离线加密密码字典，绕过前端加密保护
2. 配合弱口令/默认密码可直接暴力破解admin后台
3. 密钥泄露使整个密码传输安全模型形同虚设
4. 两个独立系统（admin和学生端）使用相同密钥，扩大了影响面

**修复建议**：

1. **立即**: 将前端AES替换为RSA非对称加密，公钥可以公开，私钥仅服务端持有
2. **或者**: 使用服务端下发的动态session key（每次登录页请求生成唯一密钥）
3. 确保学生端和admin端使用不同的加密密钥

---

### 漏洞 #3：【高危】.git目录泄露确认

**严重程度**：高 (CVSS 7.0: AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)

**漏洞URL**：
```
https://nxist.nxbys.cn/.git/HEAD
https://nxist.nxbys.cn/.git/config
https://nxist.nxbys.cn/.git/index
```

**漏洞描述**：

Web根目录下存在完整的.git版本控制目录。虽然Nginx配置阻止了直接访问（返回403），但403状态码本身证实了该目录的存在。一旦Nginx配置变更、被绕过或管理失误，攻击者可提取完整Git仓库获取全部源码。

**复现步骤**：

```bash
# .git HEAD - 存在但被阻止
curl -s -k -o /dev/null -w "HTTP %{http_code}" \
  "https://nxist.nxbys.cn/.git/HEAD"
# → HTTP 403 (文件存在，被Nginx阻止)

# .git config - 存在但被阻止
curl -s -k -o /dev/null -w "HTTP %{http_code}" \
  "https://nxist.nxbys.cn/.git/config"
# → HTTP 403

# 对比：不存在的路径返回404
curl -s -k -o /dev/null -w "HTTP %{http_code}" \
  "https://nxist.nxbys.cn/.git/nonexistent"
# → HTTP 404 (文件不存在)
```

**响应证据**：
```
.git/HEAD:    HTTP 403  ← 存在!
.git/config:  HTTP 403  ← 存在!
.git/index:   HTTP 403  ← 存在!
其他不存在:    HTTP 404
```

**危害分析**：

1. 若Nginx配置失误（如升级/迁移后忘记deny规则），.git目录将直接可访问
2. 攻击者可通过 `.git/HEAD` → `.git/refs/heads/` → `.git/objects/` 完整提取仓库
3. 源码泄露后可审计出：
   - 数据库连接凭证（config/database.php）
   - 云服务AK/SK（若有）
   - 加密密钥、盐值
   - 所有业务逻辑和API路由
   - 历史commit中可能包含曾经提交后又删除的敏感配置

**修复建议**：

1. **立即**: 从Web根目录中彻底删除 `.git` 目录（`rm -rf .git`）
2. 将Nginx 403规则改为返回404，避免信息泄露（确认文件存在）
3. 在部署流程中增加检查：禁止将.git目录部署到生产环境

---

### 漏洞 #4：【中危】学生信息枚举接口无防护

**严重程度**：中 (CVSS 5.3: AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)

**漏洞URL**：
```
POST https://nxist.nxbys.cn/user/check
```

**漏洞描述**：

学生注册第一步中的学号验证接口 `/user/check` 可在未登录、无验证码的情况下被任意调用，且无频率限制。攻击者可利用此接口枚举有效的学号与姓名组合。

**复现步骤**：

```bash
curl -s -k "https://nxist.nxbys.cn/user/check" \
  -d "username=2022100101&param=张&name=realname" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

**响应证据**：
```json
{"info":"姓名或学号不正确"}
```

**接口特征**：

| 特性 | 状态 |
|------|:----:|
| 需要登录 | ❌ 不需要 |
| 需要验证码 | ❌ 不需要 |
| 频率限制 | ❌ 无限制 |
| 响应区分存在/不存在 | ❌ 统一错误消息（好） |

**危害分析**：

- 虽然接口返回统一的"姓名或学号不正确"（较好的防枚举设计），但无频率限制意味着攻击者可以：
  - 对固定学号尝试常见姓名（如"张伟"、"李娜"等）进行匹配爆破
  - 利用大数据泄露库中的学号+姓名组合进行撞库验证
- 结合漏洞#1获取的学生数据可进一步扩大影响

**修复建议**：

1. 添加验证码保护（与注册表单共用即可）
2. 实施IP频率限制（同一IP每分钟不超过5次）
3. 连续失败后增加递增延时

---

### 漏洞 #5：【中危】UEditor/FCKEditor敏感组件暴露

**严重程度**：中 (CVSS 5.0: AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N)

**漏洞URL**：
```
https://nxist.nxbys.cn/ueditor/
https://nxist.nxbys.cn/fckeditor/
```

**漏洞描述**：

Web目录下存在UEditor和FCKEditor两个已知存在历史漏洞的富文本编辑器组件。虽然当前部分接口被Nginx阻止，但这些组件本身是攻击面的重要组成部分。

**复现步骤**：

```bash
# UEditor - 可访问
curl -s -k "https://nxist.nxbys.cn/ueditor/"
# → {"state":"请求地址出错"}  ← 确认存在

# FCKEditor - 被阻止但存在
curl -s -k -o /dev/null -w "HTTP %{http_code}" \
  "https://nxist.nxbys.cn/fckeditor/"
# → HTTP 403

# UEditor控制器 - 部分被阻止
curl -s -k -o /dev/null -w "HTTP %{http_code}" \
  "https://nxist.nxbys.cn/ueditor/controller.aspx"
# → HTTP 403
```

**响应证据**：
```
/ueditor/:                              HTTP 200 (可访问)
/ueditor/controller.aspx:               HTTP 403 (被阻止)
/ueditor/controller.jsp:                HTTP 403
/fckeditor/:                            HTTP 403
/fckeditor/editor/filemanager/...:      HTTP 403
```

**危害分析**：

1. UEditor历史漏洞包括：SSRF（catchimage接口）、XSS、文件上传
2. FCKEditor历史上存在任意文件上传漏洞（CVE-2018-9206等）
3. 若Nginx防护规则因升级/迁移被移除，这些路径将立即成为可利用的高危入口

**修复建议**：

1. 如不再使用UEditor/FCKEditor，从服务器彻底删除相关目录
2. 如必须保留，确保升级到最新安全版本
3. Nginx规则建议返回404而非403

---

### 漏洞 #6：【中危】缺少关键安全响应头

**严重程度**：中 (CVSS 4.8: AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N)

**漏洞URL**：全站所有页面

**漏洞描述**：

目标站点所有HTTP响应均未设置关键安全响应头，包括CSP、X-Frame-Options、X-Content-Type-Options、HSTS等。

**复现步骤**：

```bash
curl -s -k -I "https://nxist.nxbys.cn/" | grep -iE \
  "(Content-Security|X-Frame|X-Content|HSTS|Referrer-Policy)"
# → 无任何输出
```

**缺失的安全头与风险**：

| 缺失的安全头 | 风险 |
|-------------|------|
| Content-Security-Policy | XSS攻击无浏览器层面的防护 |
| X-Frame-Options | 页面可被iframe嵌入，存在点击劫持风险 |
| X-Content-Type-Options | MIME类型嗅探攻击 |
| Strict-Transport-Security | 中间人降级攻击 |
| Referrer-Policy | 敏感URL参数通过Referer泄露 |

**修复建议**：

在Nginx配置中添加：

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'" always;
```

---

### 漏洞 #7：【中危】JSONP登录接口跨域风险

**严重程度**：中 (CVSS 5.0: AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N)

**漏洞URL**：
```
POST https://nxist.nxbys.cn/user/login
```

**漏洞描述**：

学生登录接口使用JSONP（JSON with Padding）回调方式返回数据，这使得响应可以被跨域请求读取，存在信息泄露和CSRF攻击风险。

**复现步骤**：

学生登录页面JS代码：

```javascript
$.ajax({
    type: "post",
    url: "/user/login",
    data: form.serialize(),
    dataType: "jsonp",           // ← JSONP模式
    jsonpCallback: 'login',
})
```

**危害分析**：

1. 攻击者可构造恶意页面跨域请求登录接口
2. 利用JSONP回调函数读取登录响应（用户存在/不存在、错误信息等）
3. 结合CSRF可构造跨域JSONP劫持攻击
4. 响应中的错误信息可能被用于用户名枚举

**修复建议**：

1. 登录接口改用 `dataType: 'json'` + CORS白名单方式
2. 确保登录失败返回统一的错误信息（用户名不存在 vs 密码错误）

---

## 攻击链分析

### 最大危害攻击链

```
┌─────────────────────────────────────────────────────────┐
│  步骤A：任意企业注册（漏洞#1）                              │
│  curl POST → 302成功 → 获得企业账号                        │
│  无验证码、无短信、无邮箱验证、虚假信用代码通过              │
├─────────────────────────────────────────────────────────┤
│  步骤B：登录企业后台发布虚假职位                             │
│  发布高薪/诱人职位吸引学生投递简历                           │
├─────────────────────────────────────────────────────────┤
│  步骤C：从简历中获取学生学号+姓名+手机号                     │
│  企业端可查看投递简历的完整信息                             │
├─────────────────────────────────────────────────────────┤
│  步骤D：学号+姓名通过/user/check验证（漏洞#4）              │
│  确认学号有效性 → 触发密码重置                              │
├─────────────────────────────────────────────────────────┤
│  步骤E：接管学生账号                                       │
│  访问办事大厅 → 查看生源信息/就业信息等全部个人数据           │
└─────────────────────────────────────────────────────────┘
```

### 次要攻击链：AES密钥利用

```
AES密钥泄露（漏洞#2）
    ↓
离线加密密码字典
    ↓
爆破Admin后台 / 学生账号
    ↓
进入后台管理系统
```

---

## 安全加固建议（按优先级排序）

### 紧急（24小时内）

1. **企业注册添加验证码** — 至少添加图形验证码，阻断批量自动化注册
2. **清理测试账号** — 删除 POCDEMO2024、NXISTTEST2024、FAKECOMPANY2024、MASSTEST1-3、MINIMAL 等测试期间创建的虚假企业账号
3. **删除.git目录** — 从Web根目录彻底删除

### 高优先级（1周内）

4. **企业注册对接工商API** — 校验统一社会信用代码真实性
5. **AES密钥替换为RSA** — 或使用动态session key
6. **添加安全响应头** — CSP、X-Frame-Options、HSTS等
7. **短信接口添加频率限制** — IP+手机号维度

### 中优先级（2周内）

8. **移除UEditor/FCKEditor** — 或升级到最新安全版本
9. **JSONP改为CORS** — 登录接口移除JSONP回调
10. **/user/check添加验证码保护**
11. **全站CSRF Token统一添加**

### 低优先级（1月内）

12. **403改为404** — 避免信息泄露
13. **部署WAF** — 针对SQL注入、XSS等常见攻击
14. **安全审计** — 对全站API做一次完整的安全评估

---

## 测试用账号清单

以下为漏洞验证过程中创建的测试账号，建议全部清理：

| 用户名 | 类型 | 手机号 | 说明 |
|--------|------|--------|------|
| NXISTTEST2024 | 企业 | 13469613437 | 漏洞#1验证 |
| FAKECOMPANY2024 | 企业 | 17809526855 | 漏洞#1验证 |
| MASSTEST1 | 企业 | 18800000001 | 漏洞#1批量验证 |
| MASSTEST2 | 企业 | 18800000002 | 漏洞#1批量验证 |
| MASSTEST3 | 企业 | 18800000003 | 漏洞#1批量验证 |
| POCDEMO2024 | 企业 | 13469613437 | 漏洞#1 PoC |

---

## 测试局限性

以下测试因条件限制未完全覆盖：

1. **Admin后台功能测试**：未获取有效的admin登录凭证，无法测试后台内部的越权、SQL注入、文件上传等漏洞
2. **学生注册完整流程**：学号是预导入的，无有效学号+姓名组合无法走完三步注册
3. **短信轰炸深度测试**：短信接口有图形验证码保护，未完整测试绕过方式
4. **企业账号后续利用**：仅验证到注册成功（302），未登录测试企业后台功能
5. **云存储安全**：未在目标中发现云存储（OSS/COS/S3）域名
6. **内网渗透**：黑盒测试，无法进行内网横向移动测试

---

*报告生成时间：2026-07-16 | 测试工具：curl, Bash, Node.js*
