using System;
using UnityEngine;

namespace PTT.Helpers
{
    /// <summary>
    /// Unity component that executes an action after a delay to avoid recursion issues.
    /// </summary>
    public class DelayedAction : MonoBehaviour
    {
        private Action _action;
        private bool _initialized = false;

        public void Init(Action action)
        {
            _action = action;
            _initialized = true;
        }

        private void Update()
        {
            if (_initialized && _action != null)
            {
                // Execute the action in the next frame
                _action();
                _action = null;
                
                // Destroy this game object after executing
                Destroy(gameObject);
            }
        }
    }
}