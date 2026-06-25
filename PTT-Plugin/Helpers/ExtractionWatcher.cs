using EFT;
using EFT.Interactive;
using Comfort.Common;
using InteractableExfilsAPI.Components;
using InteractableExfilsAPI.Singletons;
using System;
using UnityEngine;

namespace PTT.Helpers;

/// <summary>
/// 撤离超时检测器。在 ExtractTo/TransitTo 调用后启动。
/// 若 5 秒后玩家仍在战局内，则恢复撤离点状态供重试。
/// </summary>
internal class ExtractionWatcher : MonoBehaviour
{
    /// <summary>
    /// 立即销毁所有活跃的 ExtractionWatcher 实例。在撤离成功或 raid 结束时调用。
    /// </summary>
    public static void CancelAll()
    {
        var watchers = FindObjectsOfType<ExtractionWatcher>();
        foreach (var w in watchers) Destroy(w.gameObject);
    }

    private float _elapsed;
    private float _timeout = 5f;
    private ExfiltrationPoint _exfil;
    private Action _onTimeout;

    public static ExtractionWatcher Create(ExfiltrationPoint exfil, Action onTimeout, float timeout = 5f)
    {
        var go = new GameObject("PTT_ExtractionWatcher");
        DontDestroyOnLoad(go);
        var watcher = go.AddComponent<ExtractionWatcher>();
        watcher._exfil = exfil;
        watcher._onTimeout = onTimeout;
        watcher._timeout = timeout;
        return watcher;
    }

    private void Update()
    {
        _elapsed += Time.deltaTime;
        if (_elapsed >= _timeout)
        {
            var gameWorld = Singleton<GameWorld>.Instance;
            if (gameWorld != null && gameWorld.MainPlayer != null && gameWorld.MainPlayer.HealthController.IsAlive)
            {
                // 玩家仍在战局内 -> 撤离失败
                Logger.Warning($"[PTT] Extraction timeout — player still in raid after {_timeout}s");

                // 重新启用撤离点碰撞器
                var session = InteractableExfilsService.GetSession();
                if (session != null && _exfil != null)
                {
                    foreach (var trigger in session.CustomExfilTriggers)
                    {
                        if (trigger.Exfil == _exfil)
                        {
                            trigger.ForceSetExfilZoneEnabled(true);
                            break;
                        }
                    }
                    // 也重新启用原版碰撞器作为备份
                    var collider = _exfil?.gameObject?.GetComponent<BoxCollider>();
                    if (collider != null) collider.enabled = true;
                    InteractableExfilsService.ForceUpdatePlayerCollisions(true); // force redetection on timeout reset
                }

                // 通知上层 (ExfilPrompt 重置状态)
                _onTimeout?.Invoke();
            }
            Destroy(gameObject);
        }
    }

    private void OnDestroy()
    {
        _onTimeout = null;
    }
}
