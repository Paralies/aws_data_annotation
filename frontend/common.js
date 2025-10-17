// common.js
    

function addContactInfo() {
  const email1 = "setg1502@kist.re.kr";
  const email2 = "syji@kist.re.kr";
  const email3 = "yerin.choi7@kist.re.kr";

  const contactHTML = `
    <div style="position: fixed; bottom: 20px; right: 20px; background: white; padding: 10px 12px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); font-size: 8px; z-index: 1000; line-height: 1.4;">
      <p style="margin: 0 0 4px 0; color: #666; font-weight: bold;">Questions or issues?</p>

      <p style="margin: 0 0 3px 0; color: #666;">
        <span style="font-weight: bold;">평가 데이터 관련 문의 :</span>
        <a href="mailto:${email1}" style="color: #007bff; text-decoration: none;">${email1}</a>
      </p>

      <p style="margin: 0 0 3px 0; color: #666;">
        <span style="font-weight: bold;">로그인 관련 문의 :</span>
        <a href="mailto:${email2}" style="color: #007bff; text-decoration: none;">${email2}</a>
      </p>

      <p style="margin: 0; color: #666;">
        <span style="font-weight: bold;">그 외 문의 :</span>
        <a href="mailto:${email3}" style="color: #007bff; text-decoration: none;">${email3}</a>
      </p>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', contactHTML);
}

function addFooter() {
  const footerHTML = `
    <div style="position: fixed; bottom: 0; left: 0; right: 0; background: #f8f9fa; padding: 12px; text-align: center; border-top: 1px solid #ddd; font-size: 13px; color: #666; z-index: 999;">
      Developed and supported by LCNP, KIST
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', footerHTML);
  
  // 페이지 하단에 여백 추가 (footer에 가려지지 않도록)
  document.body.style.paddingBottom = '50px';
}

document.addEventListener('DOMContentLoaded', function() {
  addContactInfo();
  addFooter();
});