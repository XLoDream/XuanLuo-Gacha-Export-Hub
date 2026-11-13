using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Reflection;

namespace GachaExportHubLauncher
{
    public class MainForm : Form
    {
        private const string RepoApi = "https://api.github.com/repos/XLoDream/XuanLuo-Gacha-Export-Hub/releases/latest";
        private static readonly string[] Mirrors = new[]
        {
            "",                              // 直连
            "https://ghfast.top/",
            "https://ghproxy.net/",
            "https://mirror.ghproxy.com/",
            "https://gh-proxy.com/",
            "https://ghps.cc/",
            "https://gh.api.99988866.xyz/"
        };

        private Label titleLabel;
        private Label statusLabel;
        private Label verLabel;
        private ProgressBar progressBar;
        private Button actionButton;
        private PictureBox logoBox;

        private string downloadUrl = null;
        private string fileName = null;
        private string tempPath = null;
        private WebClient client = null;

        public MainForm()
        {
            // .NET 4.0 启用 TLS 1.2
            try { ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; } catch { }
            ServicePointManager.Expect100Continue = false;
            ServicePointManager.DefaultConnectionLimit = 10;

            Text = "璇洛抽卡祈愿工具 · 下载器";
            Width = 440;
            Height = 300;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            MinimizeBox = false;
            BackColor = Color.FromArgb(0x16, 0x16, 0x1e);
            Font = new Font("Microsoft YaHei", 9F);
            try { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch { }

            logoBox = new PictureBox
            {
                Size = new Size(72, 72),
                Location = new Point(184, 14),
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.Transparent
            };
            try { logoBox.Image = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location).ToBitmap(); } catch { }
            Controls.Add(logoBox);

            titleLabel = new Label
            {
                Text = "璇洛抽卡祈愿工具",
                ForeColor = Color.White,
                Font = new Font("Microsoft YaHei", 15F, FontStyle.Bold),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            titleLabel.Location = new Point((ClientSize.Width - titleLabel.PreferredWidth) / 2, 96);
            Controls.Add(titleLabel);

            verLabel = new Label
            {
                Text = "",
                ForeColor = Color.FromArgb(0x9a, 0x9a, 0xaa),
                Font = new Font("Microsoft YaHei", 9F),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            verLabel.Location = new Point((ClientSize.Width - verLabel.PreferredWidth) / 2, 126);
            Controls.Add(verLabel);

            statusLabel = new Label
            {
                Text = "正在检查最新版本…",
                ForeColor = Color.FromArgb(0xb0, 0xb0, 0xc0),
                Font = new Font("Microsoft YaHei", 9F),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            statusLabel.Location = new Point((ClientSize.Width - statusLabel.PreferredWidth) / 2, 148);
            Controls.Add(statusLabel);

            progressBar = new ProgressBar
            {
                Width = 372,
                Height = 16,
                Location = new Point(34, 176),
                Style = ProgressBarStyle.Continuous
            };
            Controls.Add(progressBar);

            actionButton = new Button
            {
                Text = "检查中…",
                Width = 130,
                Height = 34,
                Location = new Point(155, 206),
                BackColor = Color.FromArgb(0x6e, 0xa8, 0xff),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Microsoft YaHei", 10F),
                Enabled = false,
                Cursor = Cursors.Hand
            };
            actionButton.FlatAppearance.BorderSize = 0;
            actionButton.Click += ActionButton_Click;
            Controls.Add(actionButton);

            Load += MainForm_Load;
        }

        private void MainForm_Load(object sender, EventArgs e)
        {
            ThreadPool.QueueUserWorkItem(_ => CheckLatest());
        }

        private void CenterControl(Label c)
        {
            c.Location = new Point((ClientSize.Width - c.PreferredWidth) / 2, c.Location.Y);
        }

        private void SetStatus(string text)
        {
            if (InvokeRequired) { Invoke(new Action(() => SetStatus(text))); return; }
            statusLabel.Text = text;
            CenterControl(statusLabel);
        }

        private void SetVer(string text)
        {
            if (InvokeRequired) { Invoke(new Action(() => SetVer(text))); return; }
            verLabel.Text = text;
            CenterControl(verLabel);
        }

        private void CheckLatest()
        {
            string json = null;
            foreach (var mirror in Mirrors)
            {
                try
                {
                    string url = mirror + RepoApi;
                    var req = (HttpWebRequest)WebRequest.Create(url);
                    req.UserAgent = "GachaExportHubLauncher/1.0";
                    req.Timeout = 8000;
                    req.ReadWriteTimeout = 8000;
                    req.Proxy = WebRequest.DefaultWebProxy;
                    using (var resp = (HttpWebResponse)req.GetResponse())
                    using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    {
                        json = sr.ReadToEnd();
                    }
                    if (!string.IsNullOrEmpty(json) && json.Contains("browser_download_url")) break;
                    else json = null;
                }
                catch { continue; }
            }

            if (string.IsNullOrEmpty(json))
            {
                SetStatus("无法获取版本信息，请检查网络后重试");
                Invoke(new Action(() =>
                {
                    actionButton.Enabled = true;
                    actionButton.Text = "重新检查";
                }));
                return;
            }

            try
            {
                var ser = new JavaScriptSerializer();
                var data = ser.Deserialize<Dictionary<string, object>>(json);
                string tag = data.ContainsKey("tag_name") ? data["tag_name"].ToString() : "";
                var assets = (System.Collections.IList)data["assets"];
                string dlUrl = null;
                string name = null;
                foreach (var a in assets)
                {
                    var asset = (Dictionary<string, object>)a;
                    string n = asset["name"].ToString();
                    if (n.EndsWith(".exe") && n.StartsWith("XuanLuo-Gacha-Export-Hub-Setup-"))
                    {
                        dlUrl = asset["browser_download_url"].ToString();
                        name = n;
                        break;
                    }
                }

                if (string.IsNullOrEmpty(dlUrl))
                {
                    SetStatus("未找到安装包资源");
                    Invoke(new Action(() => { actionButton.Enabled = true; actionButton.Text = "重新检查"; }));
                    return;
                }

                downloadUrl = dlUrl;
                fileName = name;
                SetVer(tag);
                SetStatus("点击按钮开始下载并安装");
                Invoke(new Action(() => { actionButton.Enabled = true; actionButton.Text = "下载并安装"; }));
            }
            catch
            {
                SetStatus("解析版本信息失败");
                Invoke(new Action(() => { actionButton.Enabled = true; actionButton.Text = "重新检查"; }));
            }
        }

        private void ActionButton_Click(object sender, EventArgs e)
        {
            if (downloadUrl == null)
            {
                actionButton.Enabled = false;
                actionButton.Text = "检查中…";
                SetStatus("正在检查最新版本…");
                progressBar.Value = 0;
                ThreadPool.QueueUserWorkItem(_ => CheckLatest());
                return;
            }
            StartDownload();
        }

        private void StartDownload()
        {
            actionButton.Enabled = false;
            actionButton.Text = "下载中…";
            progressBar.Value = 0;
            tempPath = Path.Combine(Path.GetTempPath(), fileName);
            if (File.Exists(tempPath)) { try { File.Delete(tempPath); } catch { } }
            TryDownload(0);
        }

        private void TryDownload(int mirrorIndex)
        {
            if (mirrorIndex >= Mirrors.Length)
            {
                SetStatus("所有镜像下载均失败，请检查网络");
                Invoke(new Action(() => { actionButton.Enabled = true; actionButton.Text = "重试"; }));
                return;
            }

            string url = Mirrors[mirrorIndex] + downloadUrl;
            string mirrorName = string.IsNullOrEmpty(Mirrors[mirrorIndex]) ? "直连" : Mirrors[mirrorIndex].Replace("https://", "").TrimEnd('/');
            SetStatus("正在下载（" + mirrorName + "）…");

            if (client != null) { try { client.Dispose(); } catch { } }
            client = new WebClient();
            client.Headers.Add("User-Agent", "GachaExportHubLauncher/1.0");
            client.DownloadProgressChanged += (s, e) =>
            {
                if (e.ProgressPercentage >= 0 && e.ProgressPercentage <= 100)
                {
                    if (InvokeRequired) Invoke(new Action(() => { progressBar.Value = e.ProgressPercentage; }));
                    else progressBar.Value = e.ProgressPercentage;
                }
            };
            client.DownloadFileCompleted += (s, e) =>
            {
                if (e.Error != null || e.Cancelled)
                {
                    TryDownload(mirrorIndex + 1);
                    return;
                }
                if (InvokeRequired) Invoke(new Action(() => { progressBar.Value = 100; }));
                else progressBar.Value = 100;
                SetStatus("下载完成，正在启动安装…");
                Install();
            };
            try
            {
                client.DownloadFileAsync(new Uri(url), tempPath);
            }
            catch
            {
                TryDownload(mirrorIndex + 1);
            }
        }

        private void Install()
        {
            try
            {
                var psi = new ProcessStartInfo(tempPath)
                {
                    Arguments = "/S",
                    UseShellExecute = true,
                    Verb = "runas",
                    WorkingDirectory = Path.GetDirectoryName(tempPath)
                };
                Process.Start(psi);
                Application.Exit();
            }
            catch
            {
                // 用户取消 UAC 或无权限，打开文件所在位置
                SetStatus("下载完成，请手动运行安装包");
                try
                {
                    Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + tempPath + "\"") { UseShellExecute = false });
                }
                catch { }
                Invoke(new Action(() => { actionButton.Enabled = true; actionButton.Text = "打开安装包"; }));
            }
        }
    }

    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
